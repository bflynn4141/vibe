use anyhow::{Context, Result};
use crossbeam_channel::{unbounded, Receiver, Sender};
use portable_pty::{CommandBuilder, NativePtySystem, PtyPair, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

pub struct PtySession {
    pub session_id: String,
    pty_pair: PtyPair,
    output_rx: Receiver<Vec<u8>>,
    writer_tx: Sender<Vec<u8>>,
    _reader_handle: thread::JoinHandle<()>,
    _writer_handle: thread::JoinHandle<()>,
}

impl PtySession {
    pub fn new(session_id: String, cols: u16, rows: u16) -> Result<Self> {
        let pty_system = NativePtySystem::default();

        // Create PTY
        let pty_pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("Failed to create PTY")?;

        // Get shell (zsh on Mac, bash fallback)
        let shell = if cfg!(target_os = "macos") {
            "/bin/zsh".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        };

        // Get current directory
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("/"));

        // Spawn shell
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(cwd);

        // TODO: Add ZDOTDIR for shell integration markers
        // For now, just spawn raw shell

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .context("Failed to spawn shell")?;

        println!("Spawned shell: {} (PID: {:?})", shell, child.process_id());

        // Create channels
        let (output_tx, output_rx) = unbounded::<Vec<u8>>();
        let (writer_tx, writer_rx) = unbounded::<Vec<u8>>();

        // Reader thread: PTY → frontend
        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .context("Failed to clone PTY reader")?;

        let reader_handle = thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        println!("PTY reader: EOF");
                        break;
                    }
                    Ok(n) => {
                        let data = buf[..n].to_vec();
                        if output_tx.send(data).is_err() {
                            println!("PTY reader: channel closed");
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("PTY reader error: {}", e);
                        break;
                    }
                }
            }
        });

        // Writer thread: frontend → PTY
        let writer = Arc::new(Mutex::new(
            pty_pair
                .master
                .take_writer()
                .context("Failed to take PTY writer")?,
        ));

        let writer_handle = thread::spawn(move || {
            while let Ok(data) = writer_rx.recv() {
                if let Ok(mut w) = writer.lock() {
                    if w.write_all(&data).is_err() {
                        break;
                    }
                    let _ = w.flush();
                }
            }
        });

        Ok(PtySession {
            session_id,
            pty_pair,
            output_rx,
            writer_tx,
            _reader_handle: reader_handle,
            _writer_handle: writer_handle,
        })
    }

    pub fn read_output(&self) -> Option<Vec<u8>> {
        self.output_rx.try_recv().ok()
    }

    pub fn write_input(&self, data: &[u8]) -> Result<()> {
        self.writer_tx
            .send(data.to_vec())
            .context("Failed to send input to PTY")?;
        Ok(())
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<()> {
        self.pty_pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("Failed to resize PTY")?;
        Ok(())
    }
}
