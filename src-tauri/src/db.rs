use anyhow::Result;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub cwd: String,
    pub shell: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub session_id: String,
    pub ts: String,
    pub kind: String, // 'pty_out' | 'user_in' | 'marker'
    pub data: String,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::get_db_path()?;
        let conn = Connection::open(db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                cwd TEXT,
                shell TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                ts TEXT NOT NULL,
                kind TEXT NOT NULL,
                data TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_session_ts
             ON events(session_id, ts)",
            [],
        )?;

        // Commands table for shell integration markers
        conn.execute(
            "CREATE TABLE IF NOT EXISTS commands (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                ended_at INTEGER,
                exit_code INTEGER,
                input TEXT,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_commands_session
             ON commands(session_id)",
            [],
        )?;

        Ok(Database { conn })
    }

    fn get_db_path() -> Result<PathBuf> {
        let home = std::env::var("HOME")?;
        let vibe_dir = PathBuf::from(home).join(".vibecodings");
        std::fs::create_dir_all(&vibe_dir)?;
        Ok(vibe_dir.join("sessions.db"))
    }

    pub fn create_session(&self, cwd: &str, shell: &str) -> Result<Session> {
        let session = Session {
            id: Uuid::new_v4().to_string(),
            started_at: Utc::now().to_rfc3339(),
            ended_at: None,
            cwd: cwd.to_string(),
            shell: shell.to_string(),
        };

        self.conn.execute(
            "INSERT INTO sessions (id, started_at, cwd, shell) VALUES (?1, ?2, ?3, ?4)",
            params![&session.id, &session.started_at, &session.cwd, &session.shell],
        )?;

        Ok(session)
    }

    pub fn end_session(&self, session_id: &str) -> Result<()> {
        let ended_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE sessions SET ended_at = ?1 WHERE id = ?2",
            params![ended_at, session_id],
        )?;
        Ok(())
    }

    pub fn add_event(&self, session_id: &str, kind: &str, data: &str) -> Result<()> {
        let event = Event {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            ts: Utc::now().to_rfc3339(),
            kind: kind.to_string(),
            data: data.to_string(),
        };

        self.conn.execute(
            "INSERT INTO events (id, session_id, ts, kind, data) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![&event.id, &event.session_id, &event.ts, &event.kind, &event.data],
        )?;

        Ok(())
    }

    pub fn get_session(&self, session_id: &str) -> Result<Option<Session>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, started_at, ended_at, cwd, shell FROM sessions WHERE id = ?1")?;

        let mut rows = stmt.query(params![session_id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(Session {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                cwd: row.get(3)?,
                shell: row.get(4)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_events(&self, session_id: &str) -> Result<Vec<Event>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, ts, kind, data FROM events
             WHERE session_id = ?1 ORDER BY ts ASC",
        )?;

        let events = stmt
            .query_map(params![session_id], |row| {
                Ok(Event {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    ts: row.get(2)?,
                    kind: row.get(3)?,
                    data: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(events)
    }

    pub fn get_recent_sessions(&self, limit: usize) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, started_at, ended_at, cwd, shell FROM sessions
             ORDER BY started_at DESC LIMIT ?1",
        )?;

        let sessions = stmt
            .query_map(params![limit], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    started_at: row.get(1)?,
                    ended_at: row.get(2)?,
                    cwd: row.get(3)?,
                    shell: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    // Command methods for shell integration
    pub fn create_command(&self, session_id: &str, input: &str) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let started_at = Utc::now().timestamp_millis();

        self.conn.execute(
            "INSERT INTO commands (id, session_id, started_at, input) VALUES (?1, ?2, ?3, ?4)",
            params![&id, session_id, started_at, input],
        )?;

        Ok(id)
    }

    pub fn end_command(&self, session_id: &str, exit_code: i32) -> Result<()> {
        let ended_at = Utc::now().timestamp_millis();

        // Find the most recent unfinished command
        let command_id: Option<String> = self
            .conn
            .query_row(
                "SELECT id FROM commands
                 WHERE session_id = ?1 AND ended_at IS NULL
                 ORDER BY started_at DESC LIMIT 1",
                params![session_id],
                |row| row.get(0),
            )
            .optional()?;

        // Update that command if found
        if let Some(id) = command_id {
            self.conn.execute(
                "UPDATE commands SET ended_at = ?1, exit_code = ?2 WHERE id = ?3",
                params![ended_at, exit_code, &id],
            )?;
        }

        Ok(())
    }

    pub fn get_recent_commands(&self, session_id: &str, limit: usize) -> Result<Vec<(String, i32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT input, COALESCE(exit_code, -1) FROM commands
             WHERE session_id = ?1
             ORDER BY started_at DESC LIMIT ?2",
        )?;

        let commands = stmt
            .query_map(params![session_id, limit], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(commands)
    }
}
