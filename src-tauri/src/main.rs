// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod pty;

use db::Database;
use pty::PtySession;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    db: Mutex<Database>,
    pty: Mutex<Option<PtySession>>,
}

#[tauri::command]
fn start_session(
    state: State<AppState>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("/"))
        .to_string_lossy()
        .to_string();

    let shell = if cfg!(target_os = "macos") {
        "/bin/zsh".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    };

    // Create session in database
    let db = state.db.lock().unwrap();
    let session = db
        .create_session(&cwd, &shell)
        .map_err(|e| format!("Failed to create session: {}", e))?;

    let session_id = session.id.clone();

    // Create PTY
    let pty_session = PtySession::new(session_id.clone(), cols, rows)
        .map_err(|e| format!("Failed to create PTY: {}", e))?;

    let mut pty = state.pty.lock().unwrap();
    *pty = Some(pty_session);

    Ok(session_id)
}

#[tauri::command]
fn send_input(state: State<AppState>, data: Vec<u8>) -> Result<(), String> {
    let pty = state.pty.lock().unwrap();
    if let Some(ref session) = *pty {
        session
            .write_input(&data)
            .map_err(|e| format!("Failed to write input: {}", e))?;

        // Log input to database
        let db = state.db.lock().unwrap();
        let data_str = String::from_utf8_lossy(&data).to_string();
        db.add_event(&session.session_id, "user_in", &data_str)
            .map_err(|e| format!("Failed to log input: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn read_output(state: State<AppState>) -> Result<Option<Vec<u8>>, String> {
    let pty = state.pty.lock().unwrap();
    if let Some(ref session) = *pty {
        if let Some(data) = session.read_output() {
            // Log output to database
            let db = state.db.lock().unwrap();
            let data_str = String::from_utf8_lossy(&data).to_string();
            db.add_event(&session.session_id, "pty_out", &data_str)
                .ok(); // Don't fail on log errors

            return Ok(Some(data));
        }
    }
    Ok(None)
}

#[tauri::command]
fn resize_pty(state: State<AppState>, cols: u16, rows: u16) -> Result<(), String> {
    let mut pty = state.pty.lock().unwrap();
    if let Some(ref mut session) = *pty {
        session
            .resize(cols, rows)
            .map_err(|e| format!("Failed to resize: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn end_session(state: State<AppState>) -> Result<(), String> {
    let mut pty = state.pty.lock().unwrap();
    if let Some(session) = pty.take() {
        let db = state.db.lock().unwrap();
        db.end_session(&session.session_id)
            .map_err(|e| format!("Failed to end session: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn get_recent_sessions(state: State<AppState>, limit: usize) -> Result<Vec<db::Session>, String> {
    let db = state.db.lock().unwrap();
    db.get_recent_sessions(limit)
        .map_err(|e| format!("Failed to get sessions: {}", e))
}

#[tauri::command]
fn get_session_events(state: State<AppState>, session_id: String) -> Result<Vec<db::Event>, String> {
    let db = state.db.lock().unwrap();
    db.get_events(&session_id)
        .map_err(|e| format!("Failed to get events: {}", e))
}

fn main() {
    // Initialize database
    let db = Database::new().expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(db),
            pty: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_session,
            send_input,
            read_output,
            resize_pty,
            end_session,
            get_recent_sessions,
            get_session_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
