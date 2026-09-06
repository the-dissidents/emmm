use std::fs;

#[tauri::command]
pub async fn hash_image(path: String) -> Result<String, String> {
    log::info!("hash_image start: {path}");
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let bytes =
            fs::read(path.clone())
            .map_err(|e| format!("fs::read: {e}"))?;
        let img =
            image::load_from_memory(&bytes)
            .map_err(|e| format!("decode: {e}"))?;
        let hasher = image_hasher::HasherConfig::new().to_hasher();
        log::info!("hash_image: ok {path}");
        Ok(hasher.hash_image(&img).to_base64())
    })
    .await
    .map_err(|e| format!("tokio::task::spawn_blocking: {e}"))?
}
