use std::{fs, io::Cursor};

use fast_image_resize::{images::Image, IntoImageView, Resizer};
use image::{codecs::jpeg::JpegEncoder, DynamicImage, ImageReader};
use num_traits::ToPrimitive;
use serde::Serialize;
use tauri::ipc::{Response};

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
        .plugin(
            tauri_plugin_log::Builder::new()
                .format(move |out, message, record| {
                    out.finish(format_args!(
                        "{}[{}][{}] {}",
                        tauri_plugin_log::TimezoneStrategy::UseLocal
                            .get_now()
                            .format(&time_format)
                            .unwrap(),
                        record.level(),
                        record.target(),
                        message
                    ));
                })
                .filter(|metadata| !metadata.target().starts_with("tao::"))
                .build(),
        )
        .invoke_handler(tauri::generate_handler![compress_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn try_compress_size(img: &DynamicImage, scaling: f64) -> Result<Vec<u8>, String> {
    let width = (f64::from(img.width()) * scaling).to_u32().unwrap();
    let height = (f64::from(img.height()) * scaling).to_u32().unwrap();

    let mut out = Vec::<u8>::new();
    let mut encoder = 
        JpegEncoder::new_with_quality(&mut out, 80);

    if width == img.width() {
        log::info!("try_compress_size: encoding");
        img
            .write_with_encoder(encoder)
            .map_err(|e| format!("write_with_encoder: {e}"))?;
        Ok(out)
    } else {
        log::info!("try_compress_size: resizing {width} x {height}");
        let mut dst = Image::new(
            width, height, 
            img.pixel_type().unwrap());
        Resizer::new()
            .resize(img, &mut dst, None)
            .map_err(|e| format!("resize: {e}"))?;
        log::info!("try_compress_size: encoding");
        encoder
            .encode(dst.buffer(), width, height, img.color().into())
            .map_err(|e| format!("encode: {e}"))?;
        Ok(out)
    }
}

/// format:
/// {
///     `mime_type`: len([u32]) content(string);
///     `data`: len([u32]) content(string);
/// }
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
async fn compress_image(
    path: String, max_size: usize
) -> Result<Response, String> {
    log::info!("compress_image start");
    let result = 
    tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let original = 
            fs::read(path.clone()).map_err(|e| format!("fs::read: {e}"))?;
        let reader = 
            ImageReader::new(Cursor::new(original.as_slice()))
            .with_guessed_format()
            .map_err(|e| format!("with_guessed_format: {e}"))?;
        let format = reader
            .format()
            .ok_or("with_guessed_format: cannot guess format".to_owned())?;
        let img = reader.decode().map_err(|e| format!("decode: {e}"))?;

        log::info!("compress_image decoded image");

        if format.to_mime_type() != "image/jpeg" {
            if original.len() < max_size {
                return Ok(original);
            }

            let result = try_compress_size(&img, 1.0)?;
            if result.len() < max_size {
                return Ok(result);
            }
        }

        let mut l = 0.1;
        let mut r = 1.0;
        let mut last_ok: Option<Vec<u8>> = None;
        let passable_size = (max_size.to_f64().unwrap() * 0.9).to_usize().unwrap();

        for _ in 0..3 {
            let guess = (l + r) * 0.5;
            let result = try_compress_size(&img, guess)?;
            let size = result.len();
            if size < max_size {
                l = guess;
                last_ok = Some(result);
                if size > passable_size { break; }
            } else {
                r = guess;
            }
        }
        let result = last_ok
            .ok_or("Unable to compress within size limit".to_owned())?;
        Ok(result)
    }).await;
    
    match result {
        Ok(Ok(data)) => {
            log::info!("compress_image done");
            Ok(Response::new(data))
        }
        Ok(Err(e)) => {
            Err(format!("compress_image task: {e}"))
        }
        Err(e) => {
            Err(format!("tokio::task::spawn_blocking: {e}"))
        }
    }
}