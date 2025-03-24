use std::{fs::File, io::BufWriter};

use image::{codecs::jpeg::JpegEncoder, ImageReader};
use tauri::ipc::{Channel, InvokeResponseBody, Response};
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum BackendEvent {
    #[serde(rename_all = "camelCase")]
    Done,
    #[serde(rename_all = "camelCase")]
    Failed {
        msg: String
    }
}

fn send(channel: &Channel<BackendEvent>, what: BackendEvent) {
    channel.send(what).expect("Error sending event");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        // .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            // compress_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// #[tauri::command]
// fn compress_image(channel: Channel<BackendEvent>, 
//     path: String, max_size: usize) -> Result<Response, ()> 
// {
//     let result = match (|| -> Result<Vec<u8>, String> {
//         let img = ImageReader::open(path)
//                 .map_err(|e| format!("{}", e))?
//             .with_guessed_format()
//                 .map_err(|e| format!("{}", e))?
//             .decode()
//                 .map_err(|e| format!("{}", e))?;
        
//         for _ in 0..10 {
//             let mut out = Vec::<u8>::new();
//             let encoder = JpegEncoder::new_with_quality(&mut out, 80);
//             img.write_with_encoder(encoder)
//                 .map_err(|e| format!("{}", e))?;
//             if out.len() <= max_size {
//                 return Ok(out);
//             }
//         }
//         Err("Unable to compress within size limit");
//     })() {
//         Ok(x) => x,
//         Err(e) => {
//             send(&channel, BackendEvent::Failed { msg: format!("{}", e) });
//             return Err(());
//         }
//     };
//     Ok(Response::new(InvokeResponseBody::Raw(result)))
// }