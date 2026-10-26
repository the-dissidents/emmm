use std::collections::{HashMap, HashSet};
use std::fs::{File, canonicalize, create_dir_all};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use zip::{ZipArchive, ZipWriter};
use zip::write::SimpleFileOptions;
use fancy_regex::{Captures, Regex};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct Progress {
    progress: f64,
}

// Asset IDs are URL path components, so they always use '/' regardless of
// the host platform.
fn path_to_id(path: &Path) -> String {
    path.components()
        .map(|x| x.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

// ZIP parsing and URL handling both normalize path components. Apply the same
// normalization to asset IDs so keys from the archive match IDs in the source.
fn normalize_id(id: &str) -> String {
    let normalized = id.trim_end_matches(['\r', '\n']).replace('\\', "/");
    let mut parts = Vec::<&str>::new();
    for component in normalized.split('/') {
        match component {
            "" | "." => {}
            ".." => { parts.pop(); }
            x => parts.push(x),
        }
    }
    parts.join("/")
}

fn id_to_path(id: &str) -> PathBuf {
    normalize_id(id)
        .split('/')
        .filter(|x| !x.is_empty())
        .fold(PathBuf::new(), |mut path, component| {
            path.push(component);
            path
        })
}

fn distinct_path(base: &Path, id: &Path) -> (PathBuf, PathBuf) {
    let candidate = base.join(id);
    if !candidate.exists() {
        return (id.to_path_buf(), candidate);
    }

    let parent = id.parent().unwrap_or_else(|| Path::new(""));
    let file_name = id.file_name().unwrap_or_default();
    let stem = id.file_stem().unwrap_or(file_name);
    let extension = id.extension();
    let mut n: u32 = 1;

    loop {
        let name = match extension {
            Some(ext) => format!("{}_{}.{}", stem.to_string_lossy(), n, ext.to_string_lossy()),
            None => format!("{}_{}", stem.to_string_lossy(), n),
        };
        let new_id = parent.join(name);
        let path = base.join(&new_id);
        if !path.exists() {
            return (new_id, path);
        }
        n += 1;
    }
}

#[allow(clippy::cast_precision_loss)]
#[tauri::command]
pub async fn archive(
    channel: Channel<Progress>, source: String, path: String, asset_path: Option<String>
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> anyhow::Result<()> {
        let file = File::create(&path)?;
        let writer = BufWriter::new(file);
        let mut zip = ZipWriter::new(writer);

        let re = Regex::new(r"(file|asset):(.+?)(?=[;\]\r\n])")?;
        let asset_re = Regex::new(r"asset:(.+?)(?=[;\]\r\n])")?;
        let mut map = HashMap::<String, String>::new();
        let mut reserved = HashSet::<String>::new();

        // Existing asset URLs are kept as-is, so their files must be packed
        // under the same relative path.
        for caps in asset_re.captures_iter(&source) {
            let caps = caps?;
            let id = normalize_id(&caps[1]);
            reserved.insert(id.clone());
            if map.contains_key(&id) { continue; }

            let resolved = asset_path.as_ref().map(|base| Path::new(base).join(id_to_path(&id)));
            if let Some(resolved) = resolved
                && resolved.is_file()
            {
                map.insert(id, resolved.to_string_lossy().to_string());
            } else {
                log::debug!("bad asset path: {id}");
            }
        }

        let result = re.replace_all(&source, |caps: &Captures| {
            let kind = &caps[1];
            let file_path = &caps[2];

            if kind == "asset" {
                return caps[0].to_string();
            }

            let path = Path::new(file_path);

            if let Some(name) = path.file_name()
                && path.is_file()
            {
                let key = normalize_id(&name.to_string_lossy());

                let distinct_key = if reserved.contains(&key) || map.contains_key(&key) {
                    let mut n: u32 = 0;
                    loop {
                        let new_key = format!("{n}_{key}");
                        if !reserved.contains(&new_key) && !map.contains_key(&new_key) {
                            break new_key;
                        }
                        n += 1;
                    }
                } else { key };

                map.insert(distinct_key.clone(), file_path.to_string());

                format!("asset:{distinct_key}")
            } else {
                log::debug!("bad path: {file_path}");

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

        zip.add_directory("assets/", options)?;

        for (id, source_path) in map {
            processed += 1;
            let progress = f64::from(processed) / total_files as f64;

            let mut buf = Vec::new();
            match File::open(&source_path) {
                Ok(mut f) => {
                    f.read_to_end(&mut buf)?;
                    // ZIP entry names always use '/' as the separator.
                    zip.start_file(format!("assets/{id}"), options)?;
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

/// `output` is the workspace asset path when `to_asset_path` is true, and a
/// temporary folder otherwise.
#[allow(clippy::cast_precision_loss)]
#[tauri::command]
pub async fn unarchive(
    channel: Channel<Progress>, path: String,
    asset_output_dir: String,
    is_workspace_asset_path: bool
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> anyhow::Result<String> {
        let file = File::open(&path)?;
        let reader = BufReader::new(file);
        let mut zip = ZipArchive::new(reader)?;

        create_dir_all(&asset_output_dir)?;
        let base_path = canonicalize(asset_output_dir)?;
        let len = zip.len();

        let re = Regex::new(r"asset:(.+?)(?=[;\]\r\n])")?;
        // Maps archive asset IDs to the extracted file path.
        let mut abs_path_map = HashMap::<String, String>::new();
        // Maps archive asset IDs to their (possibly renamed) IDs in assetPath.
        let mut asset_path_map = HashMap::<String, String>::new();

        for i in 0..len {
            let mut entry = zip.by_index(i)?;
            if entry.is_file()
                && let Some(file_path) = entry.enclosed_name()
                && !file_path.eq(Path::new("source.emmm"))
            {
                // New archives preserve the asset ID's folder structure under
                // `assets/`. Older archives may store files directly at the
                // root, in which case the file name is the asset ID.
                let relative_path = match file_path.strip_prefix("assets") {
                    Ok(rel) => rel.to_path_buf(),
                    Err(_) => PathBuf::from(
                        file_path.file_name().unwrap_or_default()),
                };
                let id = normalize_id(&path_to_id(&relative_path));

                if id.is_empty() {
                    log::debug!("skipping {}", entry.name());
                    continue;
                }

                let (new_id, full_path) = distinct_path(&base_path, &relative_path);
                if let Some(parent) = full_path.parent() {
                    create_dir_all(parent)?;
                }

                let created_file = File::create(&full_path)?;
                let mut writer = BufWriter::new(created_file);
                io::copy(&mut entry, &mut writer)?;
                log::debug!("copied {} to {}", entry.name(), full_path.display());

                abs_path_map.insert(
                    id.clone(), full_path.to_string_lossy().to_string());
                let new_id = normalize_id(&path_to_id(&new_id));
                asset_path_map.insert(id.clone(), new_id.clone());
            } else {
                log::debug!("skipping {}", entry.name());
            }
            channel.send(Progress { progress: (i as f64) / (len as f64) })?;
        }

        let mut source = String::new();
        zip.by_name("source.emmm")?.read_to_string(&mut source)?;

        let result = re.replace_all(&source, |caps: &Captures| {
            let id = normalize_id(&caps[1]);
            if is_workspace_asset_path {
                if let Some(new_id) = asset_path_map.get(&id) {
                    format!("asset:{new_id}")
                } else {
                    log::debug!("failed to resolve asset (wksp): {id}");

                    "invalid-".to_string() + &caps[0]
                }
            } else if let Some(v) = abs_path_map.get(&id) {
                format!("file:{v}")
            } else {
                log::debug!("failed to resolve asset: {id}");

                "invalid-".to_string() + &caps[0]
            }
        });

        Ok(result.to_string())
    })
    .await
    .map_err(|e| { log::debug!("{e:?}"); e.to_string() } )?
    .map_err(|e| { log::debug!("{e:?}"); e.to_string() } )
}
