use std::{fs, io::Cursor};

use fast_image_resize::{images::Image, IntoImageView, Resizer};
use image::{codecs::jpeg::JpegEncoder, codecs::png::PngEncoder, DynamicImage, ExtendedColorType, ImageEncoder, ImageReader};
use num_traits::ToPrimitive;
use tauri::ipc::Response;

#[derive(Clone, Copy)]
enum OutputFormat {
    Jpeg,
    Png,
}

impl OutputFormat {
    fn mime(self) -> &'static str {
        match self {
            OutputFormat::Jpeg => "image/jpeg",
            OutputFormat::Png => "image/png",
        }
    }

    fn ext(self) -> &'static str {
        match self {
            OutputFormat::Jpeg => "jpg",
            OutputFormat::Png => "png",
        }
    }
}

fn prepare_image(img: &DynamicImage) -> (OutputFormat, DynamicImage) {
    if !img.color().has_alpha() {
        return (OutputFormat::Jpeg, DynamicImage::ImageRgb8(img.to_rgb8()));
    }
    let rgba8 = img.to_rgba8();
    let opaque = rgba8.as_raw().chunks_exact(4).all(|x| x[3] == 255);
    if opaque {
        (OutputFormat::Jpeg, DynamicImage::ImageRgb8(DynamicImage::ImageRgba8(rgba8).into_rgb8()))
    } else {
        (OutputFormat::Png, DynamicImage::ImageRgba8(rgba8))
    }
}

fn try_compress_size(img: &DynamicImage, scaling: f64, format: OutputFormat) -> Result<Vec<u8>, String> {
    let width = (f64::from(img.width()) * scaling).to_u32().unwrap();
    let height = (f64::from(img.height()) * scaling).to_u32().unwrap();

    if width == img.width() {
        log::info!("try_compress_size: encoding");
        encode_dynamic(img, format)
    } else {
        log::info!("try_compress_size: resizing {width} x {height}");
        let mut dst = Image::new(width, height, img.pixel_type().unwrap());
        Resizer::new()
            .resize(img, &mut dst, None)
            .map_err(|e| format!("resize: {e}"))?;
        log::info!("try_compress_size: encoding");
        encode_raw(dst.buffer(), width, height, format)
    }
}

fn encode_dynamic(img: &DynamicImage, format: OutputFormat) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    match format {
        OutputFormat::Jpeg => {
            let encoder = JpegEncoder::new_with_quality(&mut out, 80);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("encode: {e}"))?;
        }
        OutputFormat::Png => {
            let encoder = PngEncoder::new(&mut out);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("encode: {e}"))?;
        }
    }
    Ok(out)
}

fn encode_raw(buf: &[u8], width: u32, height: u32, format: OutputFormat) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let color = match format {
        OutputFormat::Jpeg => ExtendedColorType::Rgb8,
        OutputFormat::Png => ExtendedColorType::Rgba8,
    };
    match format {
        OutputFormat::Jpeg => {
            let encoder = JpegEncoder::new_with_quality(&mut out, 80);
            encoder.write_image(buf, width, height, color)
                .map_err(|e| format!("encode: {e}"))?;
        }
        OutputFormat::Png => {
            let encoder = PngEncoder::new(&mut out);
            encoder.write_image(buf, width, height, color)
                .map_err(|e| format!("encode: {e}"))?;
        }
    }
    Ok(out)
}

fn pack_image_result(mime: &str, ext: &str, data: Vec<u8>) -> Vec<u8> {
    let mut buf: Vec<u8> = vec![];
    buf.extend((mime.len().to_u32().unwrap()).to_le_bytes());
    buf.extend(mime.as_bytes());
    buf.extend((ext.len().to_u32().unwrap()).to_le_bytes());
    buf.extend(ext.as_bytes());
    buf.extend(data);
    buf
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn compress_image(
    path: String,
    max_size: usize,
    max_width: Option<usize>,
    supported_types: Vec<String>
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

        let (output_format, img) = prepare_image(&img);

        let mut r: f64 = 1.0;
        if let Some(mw) = max_width {
            r = r.min(mw.to_f64().unwrap() / img.width().to_f64().unwrap());
        }

        if supported_types.iter().any(|x| *x == format.to_mime_type()) {
            if original.len() < max_size {
                let ext = format.extensions_str().first().map_or("", |v| v);
                return Ok(pack_image_result(format.to_mime_type(), ext, original));
            }

            let result = try_compress_size(&img, 1.0, output_format)?;
            if result.len() < max_size {
                return Ok(pack_image_result(output_format.mime(), output_format.ext(), result));
            }
        }

        let mut l = 0.1;
        let mut last_ok: Option<Vec<u8>> = None;
        let passable_size = (max_size.to_f64().unwrap() * 0.9).to_usize().unwrap();

        for _ in 0..3 {
            let guess = (l + r) * 0.5;
            let result = try_compress_size(&img, guess, output_format)?;
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
        Ok(pack_image_result(output_format.mime(), output_format.ext(), result))
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
