//! 设备标识：防小号用的两样东西。
//!
//! - 设备令牌：服务端发的不透明字符串，前端拿到后让这里在应用数据目录存一份 `device.json`，
//!   和 localStorage 互为备份（清浏览器缓存、重装 WebView2 都不会一起丢）。
//! - 机器码哈希：读系统自带的机器 ID，在这里就算好 SHA-256 再交给前端，原始 ID 不出 Rust。
//!
//! 这里任何一步出错都只返回 None / 忽略，绝不能让应用崩掉或卡住启动。

use std::{fs, path::PathBuf, sync::OnceLock};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const DEVICE_STATE_FILE: &str = "device.json";
const MACHINE_HASH_PREFIX: &str = "KukeChat-machine-v1|";

/// 机器码只读一次（Windows 上要起一个 reg.exe），之后都用缓存。
static MACHINE_HASH: OnceLock<Option<String>> = OnceLock::new();

#[derive(Serialize, Deserialize)]
struct DeviceState {
    device: String,
}

/// 和前端同一条规则：`kd_<10~40 位>.<10~40 位>`，只含 URL 安全字符。格式不对的一律不存。
fn is_valid_device_token(token: &str) -> bool {
    let Some(rest) = token.strip_prefix("kd_") else {
        return false;
    };
    let Some((left, right)) = rest.split_once('.') else {
        return false;
    };
    let part_ok = |part: &str| (10..=40).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    part_ok(left) && part_ok(right)
}

fn device_state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(DEVICE_STATE_FILE))
}

#[tauri::command]
pub fn device_token_get(app: AppHandle) -> Option<String> {
    let path = device_state_path(&app)?;
    let content = fs::read_to_string(path).ok()?;
    let state: DeviceState = serde_json::from_str(&content).ok()?;
    let token = state.device.trim().to_string();
    is_valid_device_token(&token).then_some(token)
}

#[tauri::command]
pub fn device_token_set(app: AppHandle, token: String) -> bool {
    let token = token.trim().to_string();
    if !is_valid_device_token(&token) {
        return false;
    }
    let Some(path) = device_state_path(&app) else {
        return false;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let Ok(content) = serde_json::to_string(&DeviceState { device: token }) else {
        return false;
    };
    // 先写临时文件再改名，写到一半断电也不会留下半个文件
    let temp = path.with_extension("json.tmp");
    if fs::write(&temp, content).is_err() {
        return false;
    }
    fs::rename(&temp, &path).is_ok()
}

/// 返回 sha256("KukeChat-machine-v1|" + 机器 ID) 的 64 位小写十六进制；读不到机器 ID 时返回 None。
#[tauri::command]
pub async fn machine_id() -> Option<String> {
    if let Some(cached) = MACHINE_HASH.get() {
        return cached.clone();
    }
    // Windows 要起子进程，放到阻塞线程池里做，不占用异步运行时
    let computed = tauri::async_runtime::spawn_blocking(|| read_raw_machine_id().map(|raw| hash_machine_id(&raw)))
        .await
        .ok()
        .flatten();
    MACHINE_HASH.get_or_init(|| computed).clone()
}

fn hash_machine_id(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(MACHINE_HASH_PREFIX.as_bytes());
    hasher.update(raw.as_bytes());
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// 读出来的 ID 去掉首尾空白；空的、明显是占位值的都当没读到。
fn normalize_raw_id(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_matches('"').trim();
    if trimmed.len() < 8 || trimmed.bytes().all(|b| b == b'0' || b == b'-') {
        return None;
    }
    Some(trimmed.to_string())
}

#[cfg(target_os = "windows")]
fn read_raw_machine_id() -> Option<String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // /reg:64：32 位进程也读 64 位视图，否则会落到 WOW6432Node 里读不到 MachineGuid
    let output = Command::new("reg")
        .args(["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid", "/reg:64"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    // 输出形如：    MachineGuid    REG_SZ    xxxxxxxx-xxxx-...
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find(|line| line.trim_start().to_ascii_lowercase().starts_with("machineguid"))
        .and_then(|line| line.split_whitespace().last())
        .and_then(normalize_raw_id)
}

#[cfg(target_os = "macos")]
fn read_raw_machine_id() -> Option<String> {
    use std::process::Command;
    let output = Command::new("ioreg").args(["-rd1", "-c", "IOPlatformExpertDevice"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    // 输出里有一行："IOPlatformUUID" = "XXXXXXXX-XXXX-..."
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find(|line| line.contains("\"IOPlatformUUID\""))
        .and_then(|line| line.split_once('='))
        .and_then(|(_, value)| normalize_raw_id(value))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn read_raw_machine_id() -> Option<String> {
    ["/etc/machine-id", "/var/lib/dbus/machine-id"]
        .iter()
        .find_map(|path| fs::read_to_string(path).ok().and_then(|content| normalize_raw_id(&content)))
}

#[cfg(not(any(target_os = "windows", unix)))]
fn read_raw_machine_id() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_device_token_format() {
        assert!(is_valid_device_token("kd_abcdefghijklmnopqrstuv.ABCDEFGHIJKLMNOPQRS-_v"));
        assert!(!is_valid_device_token("kd_short.abcdefghijkl"));
        assert!(!is_valid_device_token("xx_abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuv"));
        assert!(!is_valid_device_token("kd_abcdefghijklmnopqrstuv"));
        assert!(!is_valid_device_token("kd_abcdefghijklmnopqrstuv.abc def ghijklmnop"));
    }

    #[test]
    fn machine_hash_is_lowercase_hex() {
        let hash = hash_machine_id("test-machine-id");
        assert_eq!(hash.len(), 64);
        assert!(hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
    }
}
