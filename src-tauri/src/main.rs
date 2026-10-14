// No console window next to the app in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request};
use tauri::Manager;

/// `%APPDATA%/ReEziser/autosave/autosave.reeziser`, as the brief asks.
fn autosave_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("ReEziser").join("autosave").join("autosave.reeziser"))
}

/// Writes through a temporary file, so a crash mid-write never leaves half a file.
fn write_atomic(path: &PathBuf, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("reeziser-tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
fn autosave_read(app: tauri::AppHandle) -> Option<String> {
    autosave_path(&app).ok().and_then(|p| fs::read_to_string(p).ok())
}

#[tauri::command]
fn autosave_write(app: tauri::AppHandle, text: String) -> Result<(), String> {
    write_atomic(&autosave_path(&app)?, text.as_bytes())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Writes raw bytes (projects, videos, PDFs). The target path comes in the
/// `path` header as hex-encoded UTF-8, since header values must be ASCII.
#[tauri::command]
fn write_file(request: Request<'_>) -> Result<(), String> {
    let hex = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing path")?;
    let path = PathBuf::from(decode_hex_utf8(hex)?);
    match request.body() {
        InvokeBody::Raw(data) => write_atomic(&path, data),
        InvokeBody::Json(_) => Err("expected raw bytes".into()),
    }
}

fn decode_hex_utf8(hex: &str) -> Result<String, String> {
    if hex.len() % 2 != 0 {
        return Err("bad path".into());
    }
    let bytes = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
        .collect::<Result<Vec<u8>, _>>()
        .map_err(|_| "bad path")?;
    String::from_utf8(bytes).map_err(|_| "bad path".into())
}

/// The project the app was opened with (double-clicking a .reeziser file), if any.
#[tauri::command]
fn launch_file() -> Option<(String, String)> {
    std::env::args()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".reeziser"))
        .and_then(|path| fs::read_to_string(&path).ok().map(|text| (path, text)))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            autosave_read,
            autosave_write,
            read_text_file,
            write_file,
            launch_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running ReEziser");
}
