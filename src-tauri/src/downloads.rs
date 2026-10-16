//! 群文件等的原生下载：直接流式写到系统「下载」文件夹，带进度事件；完成后前端可以「在文件夹中显示」。
//! WebView2 里 a[download] 会静默落到下载目录、没有任何提示，大文件还要先整个读进内存，看起来像「点了没反应」。

use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager};

use crate::updater::{agent, http_url};

const PROGRESS_EVENT: &str = "kukechat-file-download-progress";

#[derive(Clone, serde::Serialize)]
struct Progress<'a> {
    id: &'a str,
    downloaded: u64,
    total: Option<u64>,
}

/// 文件名只留最后一段，去掉 Windows 不允许的字符和结尾的点 / 空格；空了就叫「下载的文件」
fn safe_file_name(name: &str) -> String {
    let last = name.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = last
        .chars()
        .map(|c| if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches(['.', ' ']).to_string();
    let stem = trimmed.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT")) && stem.len() == 4 && stem.as_bytes()[3].is_ascii_digit());
    if trimmed.is_empty() || reserved {
        format!("下载的文件{}", if trimmed.is_empty() { String::new() } else { format!("_{trimmed}") })
    } else {
        trimmed.chars().take(180).collect()
    }
}

/// 重名时像浏览器一样加「 (1)」「 (2)」
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], &name[index..]),
        _ => (name, ""),
    };
    (1..10_000)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|path| !path.exists())
        .unwrap_or(candidate)
}

fn download_blocking(app: &AppHandle, id: &str, url: &str, name: &str) -> Result<PathBuf, String> {
    let dir = app.path().download_dir().map_err(|_| "找不到系统的下载文件夹".to_string())?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法打开下载文件夹：{error}"))?;
    let target = unique_path(&dir, &safe_file_name(name));
    let partial = target.with_file_name(format!("{}.kcdownload", target.file_name().and_then(|n| n.to_str()).unwrap_or("file")));

    let response = agent().get(url).call().map_err(|error| format!("下载失败：{error}"))?;
    let total = response.header("Content-Length").and_then(|v| v.parse::<u64>().ok());
    let mut reader = response.into_reader();
    let mut file = fs::File::create(&partial).map_err(|error| format!("无法写入文件：{error}"))?;
    let mut buffer = vec![0u8; 64 * 1024];
    let mut downloaded = 0u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let fail = |message: String| {
        let _ = fs::remove_file(&partial);
        Err(message)
    };
    loop {
        let read = match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => n,
            Err(error) => {
                drop(file);
                return fail(format!("下载中断：{error}"));
            }
        };
        if let Err(error) = file.write_all(&buffer[..read]) {
            drop(file);
            return fail(format!("保存文件失败：{error}"));
        }
        downloaded += read as u64;
        if last_emit.elapsed() >= Duration::from_millis(150) {
            last_emit = Instant::now();
            let _ = app.emit(PROGRESS_EVENT, Progress { id, downloaded, total });
        }
    }
    let _ = app.emit(PROGRESS_EVENT, Progress { id, downloaded, total });
    if let Err(error) = file.flush() {
        drop(file);
        return fail(format!("保存文件失败：{error}"));
    }
    drop(file);
    if total.is_some_and(|expected| expected != downloaded) {
        return fail("文件下载不完整，请重试".to_string());
    }
    fs::rename(&partial, &target).map_err(|error| format!("保存文件失败：{error}"))?;
    Ok(target)
}

/// 下载到系统「下载」文件夹，返回保存的完整路径。`id` 只用来标记进度事件。
#[tauri::command]
pub async fn desktop_download_file(app: AppHandle, id: String, url: String, name: String) -> Result<String, String> {
    let url = http_url(&url).ok_or("下载地址无效")?.to_string();
    tauri::async_runtime::spawn_blocking(move || download_blocking(&app, &id, &url, &name))
        .await
        .map_err(|error| format!("下载任务失败：{error}"))
        .and_then(|inner| inner)
        .map(|path| path.to_string_lossy().into_owned())
}

/// 在资源管理器里选中这个文件（只接受下载文件夹里的路径）
#[tauri::command]
pub fn desktop_reveal_download(app: AppHandle, path: String) -> Result<(), String> {
    let dir = app.path().download_dir().map_err(|_| "找不到系统的下载文件夹".to_string())?;
    let target = PathBuf::from(&path);
    let inside = target.parent().and_then(|p| p.canonicalize().ok()) == dir.canonicalize().ok();
    if !inside || !target.exists() {
        return Err("文件已不在下载文件夹里".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(format!("/select,{}", target.display())).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg("-R").arg(&target).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(&dir).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}
