use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalSize, WindowEvent,
};

const MAIN_TRAY_ID: &str = "main";
const TRAY_BLINK_EVENT: &str = "kukechat-tray-blink";
const WINDOW_SIZE_STATE_FILE: &str = "window-size.txt";
const MIN_WINDOW_WIDTH: u32 = 900;
const MIN_WINDOW_HEIGHT: u32 = 620;
const MAX_WINDOW_WIDTH: u32 = 7680;
const MAX_WINDOW_HEIGHT: u32 = 4320;
/// 编译期注入的桌面端更新源地址。
///
/// 本仓库不内置任何服务器地址：打包时设置环境变量 `KUKECHAT_UPDATE_METADATA_URL`
/// 即可写入，未设置时桌面端「检查更新」会直接跳过而不是请求一个不存在的地址。
const BUILD_UPDATE_METADATA_URL: Option<&str> = option_env!("KUKECHAT_UPDATE_METADATA_URL");
/// 同名环境变量在运行期同样可以覆盖编译期写入的值，便于本地联调。
const UPDATE_METADATA_URL_ENV: &str = "KUKECHAT_UPDATE_METADATA_URL";

fn resolve_update_metadata_url() -> Option<String> {
    std::env::var(UPDATE_METADATA_URL_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            BUILD_UPDATE_METADATA_URL
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("KukeChat")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "hide" => hide_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(&tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                let icon = icon.to_owned();
                app.manage(TrayBlinkState {
                    default_icon: icon.clone(),
                    empty_icon: Image::new_owned(vec![0, 0, 0, 0], 1, 1),
                    generation: Arc::new(AtomicU64::new(0)),
                });
                tray_builder = tray_builder.icon(icon);
            }

            tray_builder.build(app)?;
            restore_main_window_size(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            WindowEvent::Resized(size) => {
                if window.label() == "main" {
                    save_main_window_size(window.app_handle(), size.width, size.height);
                }
            }
            WindowEvent::Focused(true) => {
                if window.label() == "main" {
                    stop_tray_blink(window.app_handle());
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![open_external_url, flash_tray_for_message, check_and_install_update, get_desktop_autostart_enabled, set_desktop_autostart_enabled])
        .run(tauri::generate_context!())
        .expect("error while running KukeChat desktop app");
}

struct TrayBlinkState {
    default_icon: Image<'static>,
    empty_icon: Image<'static>,
    generation: Arc<AtomicU64>,
}

fn show_main_window(app: &AppHandle) {
    stop_tray_blink(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn restore_main_window_size(app: &AppHandle) {
    let Some((width, height)) = read_main_window_size(app) else {
        return;
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(PhysicalSize::new(width, height));
    }
}

fn save_main_window_size(app: &AppHandle, width: u32, height: u32) {
    if !is_valid_window_size(width, height) {
        return;
    }

    let Ok(path) = window_size_state_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, format!("{width},{height}"));
}

fn read_main_window_size(app: &AppHandle) -> Option<(u32, u32)> {
    let path = window_size_state_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    let mut parts = content.trim().split(',');
    let width = parts.next()?.parse::<u32>().ok()?;
    let height = parts.next()?.parse::<u32>().ok()?;
    if is_valid_window_size(width, height) {
        Some((width, height))
    } else {
        None
    }
}

fn window_size_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(WINDOW_SIZE_STATE_FILE))
        .map_err(|error| format!("读取窗口设置目录失败：{error}"))
}

fn is_valid_window_size(width: u32, height: u32) -> bool {
    (MIN_WINDOW_WIDTH..=MAX_WINDOW_WIDTH).contains(&width) && (MIN_WINDOW_HEIGHT..=MAX_WINDOW_HEIGHT).contains(&height)
}

fn stop_tray_blink(app: &AppHandle) {
    let _ = app.emit(TRAY_BLINK_EVENT, false);
    if let (Some(tray), Some(state)) = (app.tray_by_id(MAIN_TRAY_ID), app.try_state::<TrayBlinkState>()) {
        state.generation.fetch_add(1, Ordering::Relaxed);
        let _ = tray.set_icon(Some(state.default_icon.clone()));
        let _ = tray.set_tooltip(Some("KukeChat"));
    }
}

#[tauri::command]
fn flash_tray_for_message(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    if window.is_focused().unwrap_or(false) {
        return Ok(());
    }

    let Some(state) = app.try_state::<TrayBlinkState>() else {
        return Ok(());
    };
    let Some(tray) = app.tray_by_id(MAIN_TRAY_ID) else {
        return Ok(());
    };

    let generation = state.generation.fetch_add(1, Ordering::Relaxed) + 1;
    let blink_generation = state.generation.clone();
    let default_icon = state.default_icon.clone();
    let empty_icon = state.empty_icon.clone();
    let app_for_blink = app.clone();
    let _ = tray.set_tooltip(Some("KukeChat - 有新消息"));
    app.emit(TRAY_BLINK_EVENT, true)
        .map_err(|error| error.to_string())?;

    thread::spawn(move || {
        let mut visible = false;
        loop {
            if blink_generation.load(Ordering::Relaxed) != generation {
                break;
            }

            let Some(window) = app_for_blink.get_webview_window("main") else {
                break;
            };
            if window.is_focused().unwrap_or(false) {
                break;
            }

            if let Some(tray) = app_for_blink.tray_by_id(MAIN_TRAY_ID) {
                let icon = if visible { default_icon.clone() } else { empty_icon.clone() };
                let _ = tray.set_icon(Some(icon));
                visible = !visible;
            }

            thread::sleep(Duration::from_millis(520));
        }

        if blink_generation.load(Ordering::Relaxed) == generation {
            if let Some(tray) = app_for_blink.tray_by_id(MAIN_TRAY_ID) {
                let _ = tray.set_icon(Some(default_icon));
                let _ = tray.set_tooltip(Some("KukeChat"));
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let normalized = url.trim();
    if !(normalized.starts_with("https://") || normalized.starts_with("http://")) {
        return Err("only http/https URLs can be opened".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", normalized])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(normalized)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(normalized)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
}

#[tauri::command]
fn get_desktop_autostart_enabled() -> Result<bool, String> {
    get_desktop_autostart_enabled_platform()
}

#[tauri::command]
fn set_desktop_autostart_enabled(enabled: bool) -> Result<bool, String> {
    set_desktop_autostart_enabled_platform(enabled)
}

#[cfg(target_os = "windows")]
fn get_desktop_autostart_enabled_platform() -> Result<bool, String> {
    let output = Command::new("reg")
        .args(["query", windows_run_key(), "/v", windows_autostart_value_name()])
        .output()
        .map_err(|error| format!("读取自启动设置失败：{error}"))?;
    if !output.status.success() {
        return Ok(false);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let exe_path = current_exe_path_string()?;
    Ok(stdout.to_ascii_lowercase().contains(&exe_path.to_ascii_lowercase()))
}

#[cfg(target_os = "windows")]
fn set_desktop_autostart_enabled_platform(enabled: bool) -> Result<bool, String> {
    if enabled {
        let exe_path = current_exe_path_string()?;
        let quoted_path = format!("\"{exe_path}\"");
        let status = Command::new("reg")
            .args(["add", windows_run_key(), "/v", windows_autostart_value_name(), "/t", "REG_SZ", "/d", &quoted_path, "/f"])
            .status()
            .map_err(|error| format!("开启自启动失败：{error}"))?;
        if !status.success() {
            return Err("开启自启动失败".to_string());
        }
        return Ok(true);
    }

    let status = Command::new("reg")
        .args(["delete", windows_run_key(), "/v", windows_autostart_value_name(), "/f"])
        .status()
        .map_err(|error| format!("关闭自启动失败：{error}"))?;
    if !status.success() {
        return Ok(false);
    }
    Ok(false)
}

#[cfg(target_os = "windows")]
fn current_exe_path_string() -> Result<String, String> {
    std::env::current_exe()
        .map_err(|error| format!("读取客户端路径失败：{error}"))?
        .to_str()
        .map(str::to_string)
        .ok_or_else(|| "客户端路径包含无效字符".to_string())
}

#[cfg(target_os = "windows")]
fn windows_run_key() -> &'static str {
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
}

#[cfg(target_os = "windows")]
fn windows_autostart_value_name() -> &'static str {
    "KukeChat"
}

#[cfg(not(target_os = "windows"))]
fn get_desktop_autostart_enabled_platform() -> Result<bool, String> {
    Ok(false)
}

#[cfg(not(target_os = "windows"))]
fn set_desktop_autostart_enabled_platform(_enabled: bool) -> Result<bool, String> {
    Err("当前自启动设置仅支持 Windows 桌面端".to_string())
}

#[tauri::command]
async fn check_and_install_update(app: AppHandle) -> Result<DesktopUpdateCheckResult, String> {
    tauri::async_runtime::spawn_blocking(move || check_and_install_update_blocking(app))
        .await
        .map_err(|error| format!("更新任务失败：{error}"))?
}

fn check_and_install_update_blocking(app: AppHandle) -> Result<DesktopUpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let Some(metadata_url) = resolve_update_metadata_url() else {
        return Ok(DesktopUpdateCheckResult::skipped(current_version, None, "未配置桌面端更新源"));
    };
    let metadata = fetch_update_metadata(&metadata_url)?;
    let latest_version = normalize_version(metadata.pc_version.as_deref().or(metadata.version.as_deref()));
    let Some(latest_version) = latest_version else {
        return Ok(DesktopUpdateCheckResult::skipped(current_version, None, "未配置 PC 版本号"));
    };

    if versions_match(&current_version, &latest_version) {
        return Ok(DesktopUpdateCheckResult::skipped(current_version, Some(latest_version), "当前已是最新版本"));
    }

    let installer_url = metadata.pc_url.or(metadata.url).and_then(|url| normalize_http_url(&url));
    let Some(installer_url) = installer_url else {
        return Ok(DesktopUpdateCheckResult::skipped(current_version, Some(latest_version), "未配置 PC 安装包链接"));
    };

    let installer_path = download_installer(&installer_url, &latest_version)?;
    launch_update_installer_after_exit(&installer_path, std::process::id())?;
    app.exit(0);

    Ok(DesktopUpdateCheckResult {
        current_version,
        latest_version: Some(latest_version),
        update_available: true,
        installer_started: true,
        message: "已下载新版本，正在关闭旧客户端并启动安装程序".to_string(),
    })
}

#[derive(serde::Serialize)]
struct DesktopUpdateCheckResult {
    current_version: String,
    latest_version: Option<String>,
    update_available: bool,
    installer_started: bool,
    message: String,
}

impl DesktopUpdateCheckResult {
    fn skipped(current_version: String, latest_version: Option<String>, message: &str) -> Self {
        Self {
            current_version,
            latest_version,
            update_available: false,
            installer_started: false,
            message: message.to_string(),
        }
    }
}

#[derive(serde::Deserialize)]
struct DesktopUpdateMetadata {
    url: Option<String>,
    pc_url: Option<String>,
    version: Option<String>,
    pc_version: Option<String>,
}

fn fetch_update_metadata(metadata_url: &str) -> Result<DesktopUpdateMetadata, String> {
    let url = normalize_http_url(metadata_url).ok_or_else(|| "更新元数据地址无效".to_string())?;
    ureq::get(&url)
        .timeout(Duration::from_secs(12))
        .call()
        .map_err(|error| format!("检查更新失败：{error}"))?
        .into_json::<DesktopUpdateMetadata>()
        .map_err(|error| format!("更新元数据格式错误：{error}"))
}

fn download_installer(installer_url: &str, version: &str) -> Result<PathBuf, String> {
    let temp_dir = std::env::temp_dir().join("KukeChatUpdate");
    fs::create_dir_all(&temp_dir).map_err(|error| format!("无法创建更新目录：{error}"))?;
    let installer_path = temp_dir.join(format!("KukeChat-{}-setup.exe", sanitize_filename_part(version)));
    let partial_path = installer_path.with_extension("download");
    let _ = fs::remove_file(&partial_path);
    let _ = fs::remove_file(&installer_path);

    let mut reader = ureq::get(installer_url)
        .timeout(Duration::from_secs(120))
        .call()
        .map_err(|error| format!("下载安装包失败：{error}"))?
        .into_reader();
    let mut output = fs::File::create(&partial_path).map_err(|error| format!("无法写入安装包：{error}"))?;
    std::io::copy(&mut reader, &mut output).map_err(|error| format!("保存安装包失败：{error}"))?;
    output.flush().map_err(|error| format!("保存安装包失败：{error}"))?;
    drop(output);

    let size = fs::metadata(&partial_path).map_err(|error| format!("读取安装包失败：{error}"))?.len();
    if size < 1024 * 1024 {
        let _ = fs::remove_file(&partial_path);
        return Err("下载到的安装包过小，已取消自动更新".to_string());
    }

    fs::rename(&partial_path, &installer_path).map_err(|error| format!("准备安装包失败：{error}"))?;
    Ok(installer_path)
}

#[cfg(target_os = "windows")]
fn launch_update_installer_after_exit(installer_path: &PathBuf, current_pid: u32) -> Result<(), String> {
    let escaped_installer = installer_path.to_string_lossy().replace('`', "``").replace('"', "`\"");
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; Wait-Process -Id {current_pid} -Timeout 30; Start-Process -FilePath \"{escaped_installer}\";"
    );
    Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn()
        .map_err(|error| format!("启动安装程序失败：{error}"))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn launch_update_installer_after_exit(_installer_path: &PathBuf, _current_pid: u32) -> Result<(), String> {
    Err("当前自动安装更新仅支持 Windows 桌面端".to_string())
}

fn normalize_http_url(value: &str) -> Option<String> {
    let normalized = value.trim();
    if normalized.starts_with("https://") || normalized.starts_with("http://") {
        Some(normalized.to_string())
    } else {
        None
    }
}

fn normalize_version(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|value| !value.is_empty()).map(|value| value.trim_start_matches(['v', 'V']).to_string())
}

fn versions_match(current: &str, latest: &str) -> bool {
    current.trim().trim_start_matches(['v', 'V']).eq_ignore_ascii_case(latest.trim().trim_start_matches(['v', 'V']))
}

fn sanitize_filename_part(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') { ch } else { '_' })
        .collect()
}
