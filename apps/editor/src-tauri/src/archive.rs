use std::collections::HashMap;
use std::fs::{File, canonicalize};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path};
use tauri::ipc::Channel;
use zip::{ZipArchive, ZipWriter};
use zip::write::SimpleFileOptions;
use fancy_regex::{Captures, Regex};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct Progress {
    progress: f64,
}

#[tauri::command]
pub async fn archive(
    channel: Channel<Progress>, source: String, path: String
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> anyhow::Result<()> {
        let file = File::create(&path)?;
        let writer = BufWriter::new(file);
        let mut zip = ZipWriter::new(writer);

        let re = Regex::new(r"file:(.+?)(?=[;\]\n])")?;
        let mut map = HashMap::<String, String>::new();

        let result = re.replace_all(&source, |caps: &Captures| {
            let file_path = &caps[1];

            if let Some(name) = Path::new(file_path).file_name() {
                let key = name.to_string_lossy().to_string();

                let distinct_key = if map.contains_key(&key) {
                    let mut n: u32 = 0;
                    loop {
                        let new_key = format!("{n}_{key}");
                        if !map.contains_key(&new_key) { break new_key; }
                        n += 1;
                    }
                } else { key };

                map.insert(distinct_key.clone(), file_path.to_string());

                format!("asset:{distinct_key}")
            } else {
                log::debug!("failed to get filename: {file_path}");

                caps[0].to_string()
            }
        });

        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // 2. Write the modified source file
        zip.start_file("source.emmm", options)?;
        zip.write_all(result.as_bytes())?;

        // 3. Write assets with progress reporting
        let total_files = map.len();
        let mut processed = 0;

        let assets_path = Path::new("assets/");
        zip.add_directory(assets_path.to_string_lossy(), options)?;

        for (filename, source_path) in map {
            processed += 1;
            let progress = f64::from(processed) / total_files as f64;

            let mut buf = Vec::new();
            match File::open(&source_path) {
                Ok(mut f) => {
                    f.read_to_end(&mut buf)?;
                    zip.start_file(assets_path.join(filename).to_string_lossy(), options)?;
                    zip.write_all(&buf)?;
                }
                Err(e) => {
                    return Err(anyhow::anyhow!("Failed to read {source_path}: {e}"));
                }
            }

            channel.send(Progress { progress })?;
        }

        zip.finish()?;

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unarchive(
    channel: Channel<Progress>, path: String, output: String
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> anyhow::Result<String> {
        let file = File::open(&path)?;
        let reader = BufReader::new(file);
        let mut zip = ZipArchive::new(reader)?;

        let base_path = canonicalize(output)?;
        let len = zip.len();

        let re = Regex::new(r"asset:(.+?)(?=[;\]\n])")?;
        let mut map = HashMap::<String, String>::new();

        for i in 0..len {
            let mut file = zip.by_index(i)?;
            if let Some(file_path) = file.enclosed_name()
                && let Some(file_name) = file_path.file_name()
                && !file_path.eq(Path::new("source.emmm"))
                && file.is_file()
            {
                let full_path = base_path.join(file_name);
                map.insert(
                    file_name.to_string_lossy().to_string(),
                    full_path.to_string_lossy().to_string());

                let created_file = File::create(full_path)?;
                let mut writer = BufWriter::new(created_file);
                io::copy(&mut file, &mut writer)?;
                log::debug!("copied {}", file.name());
            } else {
                log::debug!("skipping {}", file.name());
            }
            channel.send(Progress { progress: (i as f64) / (len as f64) })?;
        }

        let mut source = String::new();
        zip.by_name("source.emmm")?.read_to_string(&mut source)?;

        let result = re.replace_all(&source, |caps: &Captures| {
            let id = &caps[1];
            if let Some(v) = map.get(id) {
                format!("file:{v}")
            } else {
                log::debug!("failed to resolve asset: {id}");

                caps[0].to_string()
            }
        });

        Ok(result.to_string())
    })
    .await
    .map_err(|e| { log::debug!("{e:?}"); e.to_string() } )?
    .map_err(|e| { log::debug!("{e:?}"); e.to_string() } )
}
