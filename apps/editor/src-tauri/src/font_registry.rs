use std::{collections::HashSet, sync::Mutex};
use std::sync::Arc;

use blitz_dom::FontContext;
use font_kit::source::SystemSource;
use font_kit::handle::Handle;
use fontique::{Blob, FontInfoOverride};
use tauri::State;
use tauri::async_runtime;

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

impl FontRegistry {
    pub fn discover() -> Self {
        let existing = Self::existing_families();
        log::info!("{} existing families", existing.len());

        let source = SystemSource::new();
        let all_families = source.all_families().unwrap_or_default();
        let mut entries = Vec::new();

        for family_name in all_families {
            if existing.contains(&family_name.to_lowercase()) { continue; }
            let Ok(handle) =
                source.select_family_by_name(&family_name) else { continue; };

            for font_handle in handle.fonts() {
                let (bytes, _index) = match font_handle {
                    Handle::Path { path, font_index } => {
                        if let Ok(data) = std::fs::read(path) {
                            (Arc::new(data), font_index)
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
            "discovered {} missing font faces across {} families",
            entries.len(),
            entries.iter().map(|e| &e.family_name).collect::<HashSet<_>>().len()
        );

        FontRegistry { entries }
    }

    pub fn create_font_context(&self) -> FontContext {
        let mut font_ctx = FontContext::default();
        for entry in &self.entries {
            let blob = Blob::new(entry.bytes.clone());
            let style = match entry.style {
                FontEntryStyle::Normal => fontique::FontStyle::Normal,
                FontEntryStyle::Italic => fontique::FontStyle::Italic,
                FontEntryStyle::Oblique => fontique::FontStyle::Oblique(None),
            };
            let info_override = FontInfoOverride {
                family_name: Some(&entry.family_name),
                weight: Some(fontique::FontWeight::new(entry.weight)),
                style: Some(style),
                ..Default::default()
            };
            font_ctx.collection.register_fonts(blob, Some(info_override));
        }
        font_ctx
    }

    fn existing_families() -> HashSet<String> {
        let mut font_ctx = FontContext::default();
        font_ctx
            .collection
            .family_names()
            .map(str::to_lowercase)
            .collect()
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
