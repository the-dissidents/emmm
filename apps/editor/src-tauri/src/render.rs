use anyhow::{Context, Result};
use anyrender::render_to_buffer;
use anyrender_vello_cpu::VelloCpuImageRenderer;
use blitz_dom::DocumentConfig;
use blitz_html::HtmlDocument;
use blitz_paint::paint_scene;
use blitz_traits::shell::{ColorScheme, Viewport};
use image::codecs::png::PngEncoder;
use image::ImageEncoder;

#[allow(clippy::cast_possible_truncation)]
#[allow(clippy::cast_sign_loss)]
pub fn prerender_to_png(html: &str, width: u32, scale: f32) -> Result<Vec<u8>> {
    let phys_width = (f64::from(width) * f64::from(scale)) as u32;
    let phys_height = (10_000f64 * f64::from(scale)) as u32;
    let viewport = Viewport::new(phys_width, phys_height, scale, ColorScheme::Light);

    let doc_config = DocumentConfig {
        viewport: Some(viewport),
        ..Default::default()
    };

    let html = format!("<style>body{{margin:0;padding:0}}</style>{html}");
    let mut document = HtmlDocument::from_html(&html, doc_config);
    document.resolve(0.0);

    let content_height =
        (document.as_ref().root_element().final_layout.size.height as u32).max(1);
    let render_height = (f64::from(content_height) * f64::from(scale)) as u32;
    let render_width = (f64::from(width) * f64::from(scale)) as u32;

    let buffer = render_to_buffer::<VelloCpuImageRenderer, _>(
        |scene| {
            paint_scene(scene, document.as_ref(), f64::from(scale), render_width, render_height);
        },
        render_width,
        render_height,
    );

    let img = image::RgbaImage::from_raw(render_width, render_height, buffer)
        .context("failed to create image from buffer")?;

    let mut png_bytes = Vec::new();
    let encoder = PngEncoder::new(&mut png_bytes);
    encoder
        .write_image(&img, render_width, render_height, image::ExtendedColorType::Rgba8)
        .context("failed to encode PNG")?;

    Ok(png_bytes)
}
