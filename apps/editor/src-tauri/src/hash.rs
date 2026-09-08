use std::fs;

#[tauri::command]
pub async fn hash_file(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let bytes =
            fs::read(path.clone())
            .map_err(|e| format!("fs::read: {e}"))?;
        let hash = rapidhash::v3::rapidhash_v3(&bytes);
        Ok(format!("{hash:016x}"))
    })
    .await
    .map_err(|e| format!("tokio::task::spawn_blocking: {e}"))?
}
