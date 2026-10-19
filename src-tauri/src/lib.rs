mod device;
mod downloads;
mod updater;

use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use tauri::{image::Image, AppHandle, Emitter, Manager, PhysicalSize, WindowEvent};

const MAIN_TRAY_ID: &str = "main";
const TRAY_BLINK_EVENT: &str = "kukechat-tray-blink";
const WINDOW_SIZE_STATE_FILE: &str = "window-size.txt";
const MIN_WINDOW_WIDTH: u32 = 900;
const MIN_WINDOW_HEIGHT: u32 = 620;
const MAX_WINDOW_WIDTH: u32 = 7680;
const MAX_WINDOW_HEIGHT: u32 = 4320;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .manage(updater::UpdateState::default())
        .setup(|app| {
            let version = app.package_info().version.to_string();
            thread::spawn(move || updater::cleanup_old_installers(&version));
            setup_tray(app)?;
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
        .invoke_handler(tauri::generate_handler![open_external_url, flash_tray_for_message, updater::desktop_update_check, updater::desktop_update_download, updater::desktop_update_cancel, updater::desktop_update_install, downloads::desktop_download_file, downloads::desktop_reveal_download, device::device_token_get, device::device_token_set, device::machine_id, get_desktop_autostart_enabled, set_desktop_autostart_enabled])
        .build(tauri::generate_context!())
        .expect("error while building KukeChat desktop app")
        .run(|app, event| {
            // macOS：点红叉只是隐藏窗口（见上面的 CloseRequested），点程序坞图标时把它重新显示出来
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main_window(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

/// Windows / Linux：系统托盘（左键显示主窗口，右键菜单），新消息时图标闪烁。
#[cfg(not(target_os = "macos"))]
fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
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
    Ok(())
}

/// macOS 测试版先不放菜单栏图标（彩色图标放在菜单栏里不合规范，要单独做模板图）：
/// 窗口隐藏后点程序坞图标重新打开，新消息时程序坞图标跳一下（见 flash_tray_for_message）。
#[cfg(target_os = "macos")]
fn setup_tray(_app: &mut tauri::App) -> tauri::Result<()> {
    Ok(())
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
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

#[cfg_attr(target_os = "macos", allow(dead_code))]
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

    #[cfg(target_os = "macos")]
    {
        // 没有托盘图标：让程序坞图标跳一下，窗口获得焦点时系统自己停
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
        let _ = app.emit(TRAY_BLINK_EVENT, true);
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    start_tray_blink(app)
}

#[cfg(not(target_os = "macos"))]
fn start_tray_blink(app: AppHandle) -> Result<(), String> {
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
    let output = std::process::Command::new("reg")
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
        let status = std::process::Command::new("reg")
            .args(["add", windows_run_key(), "/v", windows_autostart_value_name(), "/t", "REG_SZ", "/d", &quoted_path, "/f"])
            .status()
            .map_err(|error| format!("开启自启动失败：{error}"))?;
        if !status.success() {
            return Err("开启自启动失败".to_string());
        }
        return Ok(true);
    }

    let status = std::process::Command::new("reg")
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
    // macOS 测试版还没做开机自启（设置页里也不显示这一项）；这里不报错，免得旧界面调用时弹出失败
    Ok(false)
}
