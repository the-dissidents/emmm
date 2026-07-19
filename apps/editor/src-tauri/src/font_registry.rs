use std::{collections::{HashMap, HashSet}, path::PathBuf, sync::Mutex};
use std::sync::Arc;

use font_kit::source::SystemSource;
use font_kit::handle::Handle;
use tauri::State;
use tauri::async_runtime;
use tauri::ipc::Response;

pub struct FontRegistry {
    entries: Vec<FontEntry>,
}

struct FontEntry {
    bytes: Arc<Vec<u8>>,
    family_name: String,
    weight: f32,
    style: FontEntryStyle,
}

#[derive(Clone, Copy)]
enum FontEntryStyle {
    Normal,
    Italic,
    Oblique,
}

impl From<font_kit::properties::Style> for FontEntryStyle {
    fn from(s: font_kit::properties::Style) -> Self {
        match s {
            font_kit::properties::Style::Normal => FontEntryStyle::Normal,
            font_kit::properties::Style::Italic => FontEntryStyle::Italic,
            font_kit::properties::Style::Oblique => FontEntryStyle::Oblique,
        }
    }
}

impl FontEntryStyle {
    fn css_name(self) -> &'static str {
        match self {
            FontEntryStyle::Normal => "normal",
            FontEntryStyle::Italic => "italic",
            FontEntryStyle::Oblique => "oblique",
        }
    }
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    buf.extend(u32::try_from(s.len()).unwrap().to_le_bytes());
    buf.extend(s.as_bytes());
}

impl FontRegistry {
    pub fn discover() -> Self {
        let source = SystemSource::new();
        let all_families = source.all_families().unwrap_or_default();
        let mut entries = Vec::new();
        let mut file_cache: HashMap<PathBuf, Arc<Vec<u8>>> = HashMap::new();

        for family_name in all_families {
            let Ok(handle) =
                source.select_family_by_name(&family_name) else { continue; };

            for font_handle in handle.fonts() {
                let (bytes, _index) = match font_handle {
                    Handle::Path { path, font_index } => {
                        if let Some(data) = file_cache.get(path) {
                            (data.clone(), font_index)
                        } else if let Ok(data) = std::fs::read(path) {
                            let data = Arc::new(data);
                            file_cache.insert(path.clone(), data.clone());
                            (data, font_index)
                        } else {
                            log::warn!("failed to read font file of {family_name} at {}", path.display());
                            continue;
                        }
                    }
                    Handle::Memory { bytes, font_index } => {
                        (bytes.clone(), font_index)
                    }
                };
                match font_handle.load() {
                    Ok(font) => {
                        let props = font.properties();
                        entries.push(FontEntry {
                            bytes,
                            family_name: font.family_name(),
                            weight: props.weight.0,
                            style: props.style.into(),
                        });
                    }
                    Err(e) => {
                        log::warn!("failed to load font face in family {family_name}: {e}");
                    }
                }
            }
        }

        log::info!(
            "discovered {} font faces across {} families",
            entries.len(),
            entries.iter().map(|e| &e.family_name).collect::<HashSet<_>>().len()
        );

        FontRegistry { entries }
    }

    /// Packs the data of all font faces whose family matches one of `families`
    /// (case-insensitively) into a binary buffer:
    /// `count:u32, [family:str, weight:f64, style:str, len:u32, data:[u8]]*`
    /// where `str` is `len:u32, utf8-bytes`. Faces sharing the same underlying
    /// file (e.g. TrueType collections) are only emitted once per family.
    #[allow(clippy::missing_panics_doc)]
    pub fn pack_fonts(&self, families: &[String]) -> Vec<u8> {
        let wanted: HashSet<String> =
            families.iter().map(|f| f.to_lowercase()).collect();
        let mut seen: HashSet<(String, *const u8)> = HashSet::new();
        let matched: Vec<&FontEntry> = self.entries.iter()
            .filter(|e| {
                let family = e.family_name.to_lowercase();
                wanted.contains(&family)
                    && seen.insert((family, e.bytes.as_ptr()))
            })
            .collect();

        let mut buf: Vec<u8> = Vec::new();
        buf.extend(u32::try_from(matched.len()).unwrap().to_le_bytes());
        for entry in matched {
            write_string(&mut buf, &entry.family_name);
            buf.extend(f64::from(entry.weight).to_le_bytes());
            write_string(&mut buf, entry.style.css_name());
            buf.extend(u32::try_from(entry.bytes.len()).unwrap().to_le_bytes());
            buf.extend(entry.bytes.iter());
        }
        buf
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn init_font_registry(
    state: State<'_, Arc<Mutex<Option<FontRegistry>>>>
) -> Result<(), tauri::Error> {
    async_runtime::spawn_blocking(FontRegistry::discover)
    .await
    .map(|r| {
        let mut value = state.lock().unwrap();
        *value = Some(r);
    })
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn pack_fonts(
    families: Vec<String>,
    state: State<'_, Arc<Mutex<Option<FontRegistry>>>>,
) -> Result<Response, String> {
    let value = state.lock().unwrap();
    let Some(registry) = value.as_ref() else {
        return Err("font registry not initialized".to_string());
    };
    Ok(Response::new(registry.pack_fonts(&families)))
}
