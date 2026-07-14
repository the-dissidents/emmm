use std::panic;

use serde::Serialize;

mod archive;
mod compress;

use archive::{archive, unarchive};
use compress::compress_image;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum BackendEvent {
    #[serde(rename_all = "camelCase")]
    Done,
    #[serde(rename_all = "camelCase")]
    Inlined { result: String },
    #[serde(rename_all = "camelCase")]
    Failed { msg: String },
}

// fn send(channel: &Channel<BackendEvent>, what: BackendEvent) {
//     channel.send(what).expect("Error sending event");
// }

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    panic::set_hook(Box::new(|info| {
        let message =
            if let Some(s) = info.payload().downcast_ref::<&str>() { (*s).to_string() }
            else if let Some(s) = info.payload().downcast_ref::<String>() { s.clone() }
            else { "<no message>".to_string() };
        let location =
            if let Some(loc) = info.location() { format!("{loc}") }
            else { "unknown location".to_string() };
        log::error!("!! FATAL !! backend panicked ({message}) at {location}");
    }));

    let time_format = time::format_description::parse(
        "[year]-[month]-[day]@[hour]:[minute]:[second].[subsecond digits:3]",
    )
    .unwrap();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .format(move |out, message, record| {
                    out.finish(format_args!(
                        "{}[{}][{}] {}",
                        tauri_plugin_log::TimezoneStrategy::UseLocal
                            .get_now().format(&time_format).unwrap(),
                        record.level(),
                        record.target(),
                        message
                    ));
                })
                .filter(|metadata| !metadata.target().starts_with("tao::"))
                .clear_targets()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stderr,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("emmm".to_string()),
                    },
                ))
                .max_file_size(5_000_000)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            compress_image,
            archive,
            unarchive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
