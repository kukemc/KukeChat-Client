//! Desktop self-update: check → download (with progress, cancellable) → install on exit.
//!
//! The metadata is the backend's `/desktop-update.json` (`pc_version` + `pc_url`). The URL comes from
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

fn agent() -> ureq::Agent {
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

fn http_url(value: &str) -> Option<&str> {
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

fn installer_path(version: &str) -> PathBuf {
    let safe: String = version.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' }).collect();
    update_dir().join(format!("KukeChat-{safe}-setup.exe"))
}

fn looks_like_installer(path: &Path) -> bool {
    let Ok(meta) = fs::metadata(path) else { return false };
    if meta.len() < MIN_INSTALLER_BYTES {
        return false;
    }
    let mut magic = [0u8; 2];
    fs::File::open(path).and_then(|mut file| file.read_exact(&mut magic)).is_ok() && &magic == b"MZ"
}

/// Downloads the installer and returns its local path. Emits `kukechat-update-progress` about 10×/s.
#[tauri::command]
pub async fn desktop_update_download(app: AppHandle, url: String, version: String) -> Result<String, String> {
    let url = http_url(&url).ok_or("安装包地址无效")?.to_string();
    let state = app.state::<UpdateState>();
    if state.downloading.swap(true, Ordering::SeqCst) {
        return Err("已经在下载更新了".to_string());
    }
    state.cancel.store(false, Ordering::SeqCst);
    let (cancel, downloading) = (state.cancel.clone(), state.downloading.clone());
    let result = tauri::async_runtime::spawn_blocking(move || download_blocking(&app, &url, &version, &cancel))
        .await
        .map_err(|error| format!("下载任务失败：{error}"))
        .and_then(|inner| inner);
    downloading.store(false, Ordering::SeqCst);
    result.map(|path| path.to_string_lossy().into_owned())
}

fn download_blocking(app: &AppHandle, url: &str, version: &str, cancel: &AtomicBool) -> Result<PathBuf, String> {
    let target = installer_path(version);
    if looks_like_installer(&target) {
        // Finished earlier (e.g. user chose "later"); files are only renamed into place once complete.
        return Ok(target);
    }
    fs::create_dir_all(update_dir()).map_err(|error| format!("无法创建更新目录：{error}"))?;
    let partial = target.with_extension("download");
    let _ = fs::remove_file(&partial);

    let response = agent().get(url).call().map_err(|error| format!("下载失败：{error}"))?;
    let total = response.header("Content-Length").and_then(|v| v.parse::<u64>().ok());
    let mut reader = response.into_reader();
    let mut file = fs::File::create(&partial).map_err(|error| format!("无法写入安装包：{error}"))?;
    let mut buffer = vec![0u8; 64 * 1024];
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

    if total.is_some_and(|expected| expected != downloaded) {
        return fail("安装包下载不完整，请重试".to_string());
    }
    if !looks_like_installer(&partial) {
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

/// Quits and runs the installer in passive update mode; it closes nothing else and relaunches KukeChat.
#[tauri::command]
pub fn desktop_update_install(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    // Only ever execute files this module downloaded.
    let dir = fs::canonicalize(update_dir()).map_err(|_| "安装包不存在，请重新下载".to_string())?;
    let file = fs::canonicalize(&path).map_err(|_| "安装包不存在，请重新下载".to_string())?;
    if file.parent() != Some(dir.as_path()) || !looks_like_installer(&file) {
        return Err("安装包无效，请重新下载".to_string());
    }
    launch_after_exit(&file, std::process::id())?;
    app.exit(0);
    Ok(())
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
    Err("自动安装目前只支持 Windows".to_string())
}

/// Removes installers older than the running version (left behind after a successful update).
pub fn cleanup_old_installers(current_version: &str) {
    let Ok(entries) = fs::read_dir(update_dir()) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(version) = name.strip_prefix("KukeChat-").and_then(|rest| rest.strip_suffix("-setup.exe").or_else(|| rest.strip_suffix("-setup.download"))) else { continue };
        if compare_versions(version, current_version).is_some_and(|order| order != CmpOrdering::Greater) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::compare_versions;
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
}
