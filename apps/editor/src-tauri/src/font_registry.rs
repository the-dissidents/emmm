use std::{collections::HashMap, path::PathBuf, sync::Mutex};
use std::collections::HashSet;
use std::sync::Arc;

use font_kit::source::SystemSource;
use font_kit::handle::Handle;
use tauri::State;
use tauri::async_runtime;
use tauri::ipc::Response;

pub struct FontRegistry {
    cache: HashMap<String, Vec<FontEntry>>,
}

struct FontEntry {
    handle: Handle,
    family_name: String,
    weight: f32,
    style: FontEntryStyle,
}

#[derive(Hash, PartialEq, Eq)]
enum FontKey {
    Path(PathBuf),
    Memory(*const u8),
}

impl FontEntry {
    fn dedup_key(&self) -> FontKey {
        match &self.handle {
            Handle::Path { path, .. } => FontKey::Path(path.clone()),
            Handle::Memory { bytes, .. } => FontKey::Memory(bytes.as_ptr()),
        }
    }

    fn load_bytes(&self) -> Option<Arc<Vec<u8>>> {
        match &self.handle {
            Handle::Path { path, .. } => std::fs::read(path).ok().map(Arc::new),
            Handle::Memory { bytes, .. } => Some(bytes.clone()),
        }
    }
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
    pub fn new() -> Self {
        FontRegistry { cache: HashMap::new() }
    }

    fn discover_family(family_name: &str) -> Vec<FontEntry> {
        let source = SystemSource::new();
        let Ok(handle) = source.select_family_by_name(family_name) else {
            return Vec::new();
        };

        let mut entries = Vec::new();
        for font_handle in handle.fonts() {
            match font_handle.load() {
                Ok(font) => {
                    let props = font.properties();
                    entries.push(FontEntry {
                        handle: font_handle.clone(),
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
        entries
    }

    fn resolve(&mut self, family_name: &str) {
        let key = family_name.to_lowercase();
        self.cache.entry(key).or_insert_with(|| Self::discover_family(family_name));
    }

    /// Packs the data of all font faces whose family matches one of `families`
    /// (case-insensitively) into a binary buffer:
    /// `count:u32, [family:str, weight:f64, style:str, len:u32, data:[u8]]*`
    /// where `str` is `len:u32, utf8-bytes`. Faces sharing the same underlying
    /// file (e.g. TrueType collections) are only emitted once per family.
    #[allow(clippy::missing_panics_doc)]
    pub fn pack_fonts(&mut self, families: &[String]) -> Vec<u8> {
        for family in families {
            self.resolve(family);
        }

        let mut seen: HashSet<(String, FontKey)> = HashSet::new();
        let mut matched: Vec<&FontEntry> = Vec::new();
        for family in families {
            let key = family.to_lowercase();
            if let Some(entries) = self.cache.get(&key) {
                for entry in entries {
                    if seen.insert((key.clone(), entry.dedup_key())) {
                        matched.push(entry);
                    }
                }
            }
        }

        let mut resolved: Vec<(&FontEntry, Arc<Vec<u8>>)> = Vec::with_capacity(matched.len());
        for entry in matched {
            match entry.load_bytes() {
                Some(bytes) => resolved.push((entry, bytes)),
                None => log::warn!("failed to read font data for {}", entry.family_name),
            }
        }

        let mut buf: Vec<u8> = Vec::new();
        buf.extend(u32::try_from(resolved.len()).unwrap().to_le_bytes());
        for (entry, bytes) in &resolved {
            write_string(&mut buf, &entry.family_name);
            buf.extend(f64::from(entry.weight).to_le_bytes());
            write_string(&mut buf, entry.style.css_name());
            buf.extend(u32::try_from(bytes.len()).unwrap().to_le_bytes());
            buf.extend(bytes.iter());
        }
        buf
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn pack_fonts(
    families: Vec<String>,
    state: State<'_, Arc<Mutex<FontRegistry>>>,
) -> Result<Response, String> {
    let registry = state.inner().clone();
    let buf = async_runtime::spawn_blocking(move || {
        let mut registry = registry.lock().unwrap();
        registry.pack_fonts(&families)
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(Response::new(buf))
}
