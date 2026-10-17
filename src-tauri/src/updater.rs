//! Desktop self-update: check → download (with progress, cancellable) → install on exit.
//!
//! The frontend normally checks `/api/v1/releases/latest` itself (changelog, forced flag, sha256) and only calls
//! `desktop_update_download`; `desktop_update_check` below is the fallback that reads the backend's
//! `/desktop-update.json` (`pc_version` + `pc_url`). The URL comes from
//! the frontend's API config; `KUKECHAT_UPDATE_METADATA_URL` (runtime env, then compile-time env)
//! still overrides it for local testing. Earlier builds only read the compile-time variable, so a
//! build made without it silently never updated.

use std::{
    cmp::Ordering as CmpOrdering,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

const PROGRESS_EVENT: &str = "kukechat-update-progress";
const UPDATE_DIR: &str = "KukeChatUpdate";
const MIN_INSTALLER_BYTES: u64 = 1024 * 1024;
const BUILD_METADATA_URL: Option<&str> = option_env!("KUKECHAT_UPDATE_METADATA_URL");
const METADATA_URL_ENV: &str = "KUKECHAT_UPDATE_METADATA_URL";

#[derive(Default)]
pub struct UpdateState {
    cancel: Arc<AtomicBool>,
    downloading: Arc<AtomicBool>,
}

#[derive(serde::Serialize)]
pub struct UpdateCheck {
    current_version: String,
    latest_version: Option<String>,
    available: bool,
    installer_url: Option<String>,
    /// Why no update is offered (not configured, already latest…), for the settings page.
    message: String,
}

#[derive(serde::Serialize, Clone)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

#[derive(serde::Deserialize)]
struct Metadata {
    url: Option<String>,
    pc_url: Option<String>,
    version: Option<String>,
    pc_version: Option<String>,
}

pub(crate) fn agent() -> ureq::Agent {
    // Per-read timeout instead of a total one: a 5 MB installer on a slow link must not be killed at 120 s.
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(30))
        .user_agent(concat!("KukeChat-Desktop/", env!("CARGO_PKG_VERSION")))
        .build()
}

fn metadata_url(from_frontend: Option<String>) -> Option<String> {
    std::env::var(METADATA_URL_ENV).ok()
        .or_else(|| BUILD_METADATA_URL.map(str::to_string))
        .or(from_frontend)
        .map(|value| value.trim().to_string())
        .filter(|value| http_url(value).is_some())
}

pub(crate) fn http_url(value: &str) -> Option<&str> {
    let value = value.trim();
    (value.starts_with("https://") || value.starts_with("http://")).then_some(value)
}

/// Numeric dotted compare; a pre-release (`1.4.0-beta`) sorts before its release. Unparseable → None.
pub fn compare_versions(a: &str, b: &str) -> Option<CmpOrdering> {
    fn parse(value: &str) -> Option<(Vec<u64>, bool)> {
        let value = value.trim().trim_start_matches(['v', 'V']);
        let (core, pre) = match value.split_once(['-', '+']) {
            Some((core, rest)) => (core, value[core.len()..].starts_with('-') && !rest.is_empty()),
            None => (value, false),
        };
        let parts = core.split('.').map(|part| part.parse::<u64>().ok()).collect::<Option<Vec<_>>>()?;
        (!parts.is_empty()).then_some((parts, pre))
    }
    let (mut a_parts, a_pre) = parse(a)?;
    let (mut b_parts, b_pre) = parse(b)?;
    let len = a_parts.len().max(b_parts.len());
    a_parts.resize(len, 0);
    b_parts.resize(len, 0);
    Some(a_parts.cmp(&b_parts).then_with(|| b_pre.cmp(&a_pre)))
}

#[tauri::command]
pub async fn desktop_update_check(app: AppHandle, metadata_url: Option<String>) -> Result<UpdateCheck, String> {
    tauri::async_runtime::spawn_blocking(move || check_blocking(&app, metadata_url))
        .await
        .map_err(|error| format!("检查更新失败：{error}"))?
}

fn check_blocking(app: &AppHandle, from_frontend: Option<String>) -> Result<UpdateCheck, String> {
    let current = app.package_info().version.to_string();
    let none = |latest: Option<String>, message: &str| UpdateCheck {
        current_version: current.clone(), latest_version: latest, available: false, installer_url: None, message: message.to_string(),
    };
    let Some(url) = metadata_url(from_frontend) else {
        return Ok(none(None, "未配置更新源"));
    };
    let metadata: Metadata = agent()
        .get(&url)
        .call()
        .map_err(|error| format!("无法连接更新服务器：{error}"))?
        .into_json()
        .map_err(|error| format!("更新信息格式错误：{error}"))?;

    let latest = metadata.pc_version.or(metadata.version).map(|v| v.trim().trim_start_matches(['v', 'V']).to_string()).filter(|v| !v.is_empty());
    let Some(latest) = latest else {
        return Ok(none(None, "服务器暂未发布 PC 版本"));
    };
    match compare_versions(&latest, &current) {
        Some(CmpOrdering::Greater) => {}
        Some(_) => return Ok(none(Some(latest), "已是最新版本")),
        None => return Ok(none(Some(latest), "无法识别服务器上的版本号")),
    }
    let installer = metadata.pc_url.or(metadata.url).and_then(|u| http_url(&u).map(str::to_string));
    let Some(installer) = installer else {
        return Ok(none(Some(latest), "服务器暂未提供安装包"));
    };
    Ok(UpdateCheck { current_version: current, latest_version: Some(latest), available: true, installer_url: Some(installer), message: "发现新版本".to_string() })
}

fn update_dir() -> PathBuf {
    std::env::temp_dir().join(UPDATE_DIR)
}

/// 安装包的种类。Windows 只有 NSIS 安装程序；macOS 有两种：更新器优先用 `.app.tar.gz`（能自动替换），
/// 发版服务只给了 dmg 时也能下载，下载完打开让用户自己拖进「应用程序」。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum PackageKind {
    WindowsSetup,
    MacAppArchive,
    MacDmg,
}

impl PackageKind {
    /// 按发版服务给的文件名（没有就看地址）判断；判断不出来时按当前平台的默认格式
    fn detect(file_name: Option<&str>, url: &str) -> Result<Self, String> {
        let url_path = url.split(['?', '#']).next().unwrap_or(url);
        let name = file_name.map(str::trim).filter(|name| !name.is_empty()).unwrap_or(url_path).to_ascii_lowercase();
        let kind = if name.ends_with(".dmg") {
            Self::MacDmg
        } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
            Self::MacAppArchive
        } else if name.ends_with(".exe") {
            Self::WindowsSetup
        } else if cfg!(target_os = "macos") {
            Self::MacAppArchive
        } else {
            Self::WindowsSetup
        };
        let supported = if cfg!(target_os = "macos") { kind != Self::WindowsSetup } else { kind == Self::WindowsSetup };
        supported.then_some(kind).ok_or_else(|| "这个安装包不适用于当前系统".to_string())
    }

    /// 文件名里版本号后面那段（不含扩展名），也用来认出旧的残留文件
    fn tag(self) -> &'static str {
        match self {
            Self::WindowsSetup => "setup",
            Self::MacAppArchive => "macos-app",
            Self::MacDmg => "macos-dmg",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::WindowsSetup => ".exe",
            Self::MacAppArchive => ".tar.gz",
            Self::MacDmg => ".dmg",
        }
    }

    fn from_path(path: &Path) -> Option<Self> {
        let name = path.file_name()?.to_str()?;
        [Self::WindowsSetup, Self::MacAppArchive, Self::MacDmg]
            .into_iter()
            .find(|kind| name.ends_with(&format!("-{}{}", kind.tag(), kind.extension())))
    }
}

fn safe_version(version: &str) -> String {
    version.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' }).collect()
}

/// Windows 仍是 `KukeChat-<v>-setup.exe`（和旧版本一致，旧版本留下的文件照样能清理）
fn installer_path(version: &str, kind: PackageKind) -> PathBuf {
    update_dir().join(format!("KukeChat-{}-{}{}", safe_version(version), kind.tag(), kind.extension()))
}

/// 下载中的临时文件：`KukeChat-<v>-<tag>.download`，下载完整、校验通过才改名成正式文件
fn partial_path(version: &str, kind: PackageKind) -> PathBuf {
    update_dir().join(format!("KukeChat-{}-{}.download", safe_version(version), kind.tag()))
}

fn looks_like_installer(path: &Path, kind: PackageKind) -> bool {
    let Ok(meta) = fs::metadata(path) else { return false };
    if !meta.is_file() || meta.len() < MIN_INSTALLER_BYTES {
        return false;
    }
    let Ok(mut file) = fs::File::open(path) else { return false };
    match kind {
        PackageKind::WindowsSetup => {
            let mut magic = [0u8; 2];
            file.read_exact(&mut magic).is_ok() && &magic == b"MZ"
        }
        PackageKind::MacAppArchive => {
            let mut magic = [0u8; 2];
            file.read_exact(&mut magic).is_ok() && magic == [0x1f, 0x8b]
        }
        PackageKind::MacDmg => {
            // UDIF 镜像的最后 512 字节是 koly 尾块
            use std::io::{Seek, SeekFrom};
            let mut magic = [0u8; 4];
            file.seek(SeekFrom::End(-512)).is_ok() && file.read_exact(&mut magic).is_ok() && &magic == b"koly"
        }
    }
}

/// Downloads the installer and returns its local path. Emits `kukechat-update-progress` about 10×/s.
#[tauri::command]
pub async fn desktop_update_download(
    app: AppHandle,
    url: String,
    version: String,
    sha256: Option<String>,
    expected_size: Option<u64>,
    file_name: Option<String>,
) -> Result<String, String> {
    let url = http_url(&url).ok_or("安装包地址无效")?.to_string();
    let kind = PackageKind::detect(file_name.as_deref(), &url)?;
    // 发版服务给的 sha256（64 位十六进制）；格式不对就当没给，不能因为它挡住更新
    let sha256 = sha256
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit()));
    let state = app.state::<UpdateState>();
    if state.downloading.swap(true, Ordering::SeqCst) {
        return Err("已经在下载更新了".to_string());
    }
    state.cancel.store(false, Ordering::SeqCst);
    let (cancel, downloading) = (state.cancel.clone(), state.downloading.clone());
    let result = tauri::async_runtime::spawn_blocking(move || download_blocking(&app, &url, &version, kind, sha256.as_deref(), expected_size, &cancel))
        .await
        .map_err(|error| format!("下载任务失败：{error}"))
        .and_then(|inner| inner);
    downloading.store(false, Ordering::SeqCst);
    result.map(|path| path.to_string_lossy().into_owned())
}

fn file_sha256(path: &Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Some(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn download_blocking(
    app: &AppHandle,
    url: &str,
    version: &str,
    kind: PackageKind,
    sha256: Option<&str>,
    expected_size: Option<u64>,
    cancel: &AtomicBool,
) -> Result<PathBuf, String> {
    let target = installer_path(version, kind);
    if looks_like_installer(&target, kind) {
        // Finished earlier (e.g. user chose "later"); files are only renamed into place once complete.
        // With a known checksum, re-verify: a stale or tampered file must not be installed.
        match sha256 {
            Some(expected) if file_sha256(&target).as_deref() != Some(expected) => {
                let _ = fs::remove_file(&target);
            }
            _ => return Ok(target),
        }
    }
    fs::create_dir_all(update_dir()).map_err(|error| format!("无法创建更新目录：{error}"))?;
    let partial = partial_path(version, kind);
    let _ = fs::remove_file(&partial);

    let response = agent().get(url).call().map_err(|error| format!("下载失败：{error}"))?;
    let total = response.header("Content-Length").and_then(|v| v.parse::<u64>().ok());
    let mut reader = response.into_reader();
    let mut file = fs::File::create(&partial).map_err(|error| format!("无法写入安装包：{error}"))?;
    let mut buffer = vec![0u8; 64 * 1024];
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let fail = |message: String| { let _ = fs::remove_file(&partial); Err(message) };

    loop {
        if cancel.load(Ordering::SeqCst) {
            drop(file);
            return fail("已取消下载".to_string());
        }
        let read = match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => n,
            Err(error) => { drop(file); return fail(format!("下载中断：{error}")); }
        };
        if let Err(error) = file.write_all(&buffer[..read]) {
            drop(file);
            return fail(format!("保存安装包失败：{error}"));
        }
        hasher.update(&buffer[..read]);
        downloaded += read as u64;
        if last_emit.elapsed() >= Duration::from_millis(100) {
            last_emit = Instant::now();
            let _ = app.emit(PROGRESS_EVENT, Progress { downloaded, total });
        }
    }
    let _ = app.emit(PROGRESS_EVENT, Progress { downloaded, total });
    if let Err(error) = file.flush() {
        drop(file);
        return fail(format!("保存安装包失败：{error}"));
    }
    drop(file);

    if total.is_some_and(|expected| expected != downloaded) || expected_size.is_some_and(|expected| expected != downloaded) {
        return fail("安装包下载不完整，请重试".to_string());
    }
    if let Some(expected) = sha256 {
        if hex(&hasher.finalize()) != expected {
            return fail("安装包校验失败，请重新下载".to_string());
        }
    }
    if !looks_like_installer(&partial, kind) {
        return fail("下载到的文件不是有效的安装包".to_string());
    }
    let _ = fs::remove_file(&target);
    fs::rename(&partial, &target).map_err(|error| format!("准备安装包失败：{error}"))?;
    Ok(target)
}

#[tauri::command]
pub fn desktop_update_cancel(app: AppHandle) {
    app.state::<UpdateState>().cancel.store(true, Ordering::SeqCst);
}

/// Windows：退出并以静默更新模式运行安装程序，安装程序装完会重新打开 KukeChat。返回 "restarting"。
/// macOS：见 `install_macos`；能自动替换时同样返回 "restarting"，否则在访达里打开新版本、返回 "manual"（不退出）。
#[tauri::command]
pub fn desktop_update_install(app: AppHandle, path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    // Only ever execute files this module downloaded.
    let dir = fs::canonicalize(update_dir()).map_err(|_| "安装包不存在，请重新下载".to_string())?;
    let file = fs::canonicalize(&path).map_err(|_| "安装包不存在，请重新下载".to_string())?;
    let kind = PackageKind::from_path(&file).ok_or("安装包无效，请重新下载")?;
    if file.parent() != Some(dir.as_path()) || !looks_like_installer(&file, kind) {
        return Err("安装包无效，请重新下载".to_string());
    }
    match kind {
        PackageKind::WindowsSetup => {
            launch_after_exit(&file, std::process::id())?;
            app.exit(0);
            Ok("restarting".to_string())
        }
        PackageKind::MacAppArchive | PackageKind::MacDmg => install_macos(&app, &file, kind),
    }
}

#[cfg(target_os = "windows")]
fn launch_after_exit(installer: &Path, pid: u32) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // PowerShell single-quoted literal: only ' needs escaping (as '').
    let quoted = installer.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; Wait-Process -Id {pid} -Timeout 30; Start-Process -FilePath '{quoted}' -ArgumentList '/P','/R','/UPDATE'"
    );
    Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("启动安装程序失败：{error}"))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn launch_after_exit(_installer: &Path, _pid: u32) -> Result<(), String> {
    Err("这个安装包只能在 Windows 上安装".to_string())
}

#[cfg(not(target_os = "macos"))]
fn install_macos(_app: &AppHandle, _file: &Path, _kind: PackageKind) -> Result<String, String> {
    Err("这个安装包只能在 macOS 上安装".to_string())
}

/// macOS 安装：
/// - dmg：直接打开（挂载后访达会显示），让用户把 KukeChat 拖进「应用程序」替换。返回 "manual"。
/// - .app.tar.gz：解压到更新目录。当前程序是从一个可写目录里正常运行的 `.app`（比如 /Applications）时，
///   起一个独立的 sh 进程：等本进程退出 → 旧 `.app` 改名备份 → 复制新 `.app` 过去 → 失败就还原备份 →
///   去掉隔离属性 → 重新打开。返回 "restarting" 并退出。
///   条件不满足（直接从 dmg 里运行、被系统「App 转移」放在只读的随机路径、没有写权限）就在访达里选中解压出来的
///   新 `.app`，返回 "manual"。
///
/// 隔离属性：更新器自己用 HTTP 下载的文件不会被系统打上 com.apple.quarantine（只有浏览器等声明了
/// LSFileQuarantineEnabled 的程序才会），所以换上去的新版本不会再弹「无法验证开发者」；这里仍然顺手
/// `xattr -dr` 一次，防止以后改成别的下载方式。
#[cfg(target_os = "macos")]
fn install_macos(app: &AppHandle, file: &Path, kind: PackageKind) -> Result<String, String> {
    use std::os::unix::process::CommandExt;
    use std::process::Stdio;

    if kind == PackageKind::MacDmg {
        Command::new("/usr/bin/open").arg(file).spawn().map_err(|error| format!("打开安装包失败：{error}"))?;
        return Ok("manual".to_string());
    }

    // 解压到 KukeChat-<v>-macos-app/（压缩包名去掉 .tar.gz），每次重新解压
    let name = file.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    let extract_dir = file.with_file_name(name.trim_end_matches(".tar.gz"));
    let _ = fs::remove_dir_all(&extract_dir);
    fs::create_dir_all(&extract_dir).map_err(|error| format!("无法创建解压目录：{error}"))?;
    let status = Command::new("/usr/bin/tar")
        .arg("-xzf").arg(file).arg("-C").arg(&extract_dir)
        .status()
        .map_err(|error| format!("解压安装包失败：{error}"))?;
    if !status.success() {
        let _ = fs::remove_dir_all(&extract_dir);
        return Err("解压安装包失败，请重新下载".to_string());
    }
    let new_app = fs::read_dir(&extract_dir)
        .map_err(|error| format!("读取安装包失败：{error}"))?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| path.extension().is_some_and(|ext| ext == "app") && path.join("Contents/Info.plist").is_file())
        .ok_or("安装包里没有找到 KukeChat.app，请重新下载")?;
    let _ = Command::new("/usr/bin/xattr").args(["-dr", "com.apple.quarantine"]).arg(&new_app).status();

    let reveal = |path: &Path| -> Result<String, String> {
        Command::new("/usr/bin/open").arg("-R").arg(path).spawn().map_err(|error| format!("打开访达失败：{error}"))?;
        Ok("manual".to_string())
    };

    let Some(current_app) = current_app_bundle() else { return reveal(&new_app) };
    let text = current_app.to_string_lossy();
    let parent_writable = current_app.parent().is_some_and(dir_writable);
    if text.contains("/AppTranslocation/") || text.starts_with("/Volumes/") || !parent_writable {
        return reveal(&new_app);
    }

    const SCRIPT: &str = r#"
PID="$1"; OLD="$2"; NEW="$3"; BACKUP="$OLD.kukechat-old"
i=0
while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 150 ]; do sleep 0.2; i=$((i+1)); done
rm -rf "$BACKUP"
if mv "$OLD" "$BACKUP"; then
  if /usr/bin/ditto "$NEW" "$OLD"; then
    rm -rf "$BACKUP"
  else
    rm -rf "$OLD"
    mv "$BACKUP" "$OLD"
  fi
fi
/usr/bin/xattr -dr com.apple.quarantine "$OLD" 2>/dev/null
/usr/bin/open "$OLD"
"#;
    Command::new("/bin/sh")
        .arg("-c").arg(SCRIPT).arg("kukechat-update")
        .arg(std::process::id().to_string()).arg(&current_app).arg(&new_app)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        // 单独一个进程组：本进程退出时它不受影响
        .process_group(0)
        .spawn()
        .map_err(|error| format!("启动更新失败：{error}"))?;
    app.exit(0);
    Ok("restarting".to_string())
}

/// 当前运行的 `.app` 目录：可执行文件在 `<X>.app/Contents/MacOS/<exe>`
#[cfg(target_os = "macos")]
fn current_app_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let exe = fs::canonicalize(&exe).unwrap_or(exe);
    let bundle = exe.parent()?.parent()?.parent()?.to_path_buf();
    bundle.extension().is_some_and(|ext| ext == "app").then_some(bundle)
}

#[cfg(target_os = "macos")]
fn dir_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".kukechat-update-probe-{}", std::process::id()));
    let ok = fs::File::create(&probe).is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

/// Removes installers older than the running version (left behind after a successful update).
pub fn cleanup_old_installers(current_version: &str) {
    let Ok(entries) = fs::read_dir(update_dir()) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(version) = installer_version(&name) else { continue };
        if compare_versions(version, current_version).is_some_and(|order| order != CmpOrdering::Greater) {
            let path = entry.path();
            // macOS 的解压目录（KukeChat-<v>-macos-app/）是个文件夹
            let _ = if path.is_dir() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
        }
    }
}

/// 从更新目录里的文件名认出版本号：`KukeChat-<v>-<tag>(.exe|.tar.gz|.dmg|.download)` 或解压目录 `KukeChat-<v>-macos-app`
fn installer_version(name: &str) -> Option<&str> {
    let rest = name.strip_prefix("KukeChat-")?;
    const SUFFIXES: [&str; 7] = [
        "-setup.exe", "-setup.download",
        "-macos-app.tar.gz", "-macos-app.download", "-macos-app",
        "-macos-dmg.dmg", "-macos-dmg.download",
    ];
    SUFFIXES.iter().find_map(|suffix| rest.strip_suffix(suffix))
}

#[cfg(test)]
mod tests {
    use super::{compare_versions, installer_version, PackageKind};
    use std::cmp::Ordering::*;

    #[test]
    fn compares_versions() {
        assert_eq!(compare_versions("1.3.2", "1.3.1"), Some(Greater));
        assert_eq!(compare_versions("1.3.1", "1.3.2"), Some(Less));
        assert_eq!(compare_versions("v1.3.2", "1.3.2"), Some(Equal));
        assert_eq!(compare_versions("1.10.0", "1.9.9"), Some(Greater));
        assert_eq!(compare_versions("1.4", "1.4.0"), Some(Equal));
        assert_eq!(compare_versions("1.4.0-beta.1", "1.4.0"), Some(Less));
        assert_eq!(compare_versions("1.4.0", "1.4.0-beta.1"), Some(Greater));
        assert_eq!(compare_versions("abc", "1.0.0"), None);
    }

    #[test]
    fn recognizes_update_files() {
        assert_eq!(installer_version("KukeChat-2.0.2-setup.exe"), Some("2.0.2"));
        assert_eq!(installer_version("KukeChat-2.0.2-setup.download"), Some("2.0.2"));
        assert_eq!(installer_version("KukeChat-2.0.3-macos-app.tar.gz"), Some("2.0.3"));
        assert_eq!(installer_version("KukeChat-2.0.3-macos-app"), Some("2.0.3"));
        assert_eq!(installer_version("KukeChat-2.0.3-macos-dmg.dmg"), Some("2.0.3"));
        assert_eq!(installer_version("other.txt"), None);
    }

    #[test]
    fn detects_package_kind() {
        let exe = PackageKind::detect(Some("KukeChat_2.0.2_x64-setup.exe"), "https://x/a");
        let tgz = PackageKind::detect(None, "https://x/KukeChat.app.tar.gz?sig=1");
        if cfg!(target_os = "macos") {
            assert!(exe.is_err());
            assert_eq!(tgz, Ok(PackageKind::MacAppArchive));
        } else {
            assert_eq!(exe, Ok(PackageKind::WindowsSetup));
            assert!(tgz.is_err());
        }
    }
}
