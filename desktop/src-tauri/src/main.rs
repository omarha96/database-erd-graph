// Desktop app: starts the bundled backend (server.js compiled into the
// erd-server sidecar) on a private localhost port, then opens a window on it.
// The system webview is used, so no browser engine ships with the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct Backend(Mutex<Option<Child>>);

fn start_backend(app: &tauri::App) -> Result<(Child, u16), Box<dyn std::error::Error>> {
    // Tauri installs externalBin sidecars next to the main executable.
    let exe = std::env::current_exe()?;
    let name = if cfg!(windows) { "erd-server.exe" } else { "erd-server" };
    let mut cmd = Command::new(exe.with_file_name(name));
    cmd.env("PORT", "0")
        .env("HOST", "127.0.0.1") // never reachable from the LAN
        .env("ERD_PUBLIC_DIR", app.path().resource_dir()?.join("dist"))
        .stdout(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn()?;

    // server.js prints "ERD viewer running at http://localhost:<port>".
    let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
    while let Some(line) = lines.next() {
        if let Some(port) = line?.split("localhost:").nth(1).and_then(|rest| {
            rest.split(|c: char| !c.is_ascii_digit()).next()?.parse().ok()
        }) {
            // Keep draining stdout so the backend never blocks on a full pipe.
            std::thread::spawn(move || lines.for_each(drop));
            return Ok((child, port));
        }
    }
    Err("the backend exited before it started listening".into())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let (child, port) = start_backend(app)?;
            app.manage(Backend(Mutex::new(Some(child))));
            let url = format!("http://127.0.0.1:{port}").parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("ERD Viewer")
                .inner_size(1440.0, 900.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the app")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<Backend>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
