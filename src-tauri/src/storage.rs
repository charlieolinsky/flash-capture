use crate::models::{Settings, Store};
use std::fs;
use std::path::{Path, PathBuf};

fn app_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "Could not resolve app data directory".to_string())?;
    let dir = base.join("flashcapture");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data dir: {e}"))?;
    Ok(dir)
}

fn cards_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join("cards.json"))
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join("settings.json"))
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents).map_err(|e| format!("Failed to write temp file: {e}"))?;
    if path.exists() {
        let bak = path.with_extension("json.bak");
        let _ = fs::copy(path, &bak);
    }
    fs::rename(&tmp, path).map_err(|e| format!("Failed to finalize write: {e}"))?;
    Ok(())
}

pub fn load_store() -> Result<Store, String> {
    let path = cards_path()?;
    if !path.exists() {
        let store = Store::default();
        save_store(&store)?;
        return Ok(store);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Failed to read cards.json: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid cards.json: {e}"))
}

pub fn save_store(store: &Store) -> Result<(), String> {
    let path = cards_path()?;
    let raw = serde_json::to_string_pretty(store).map_err(|e| format!("Serialize error: {e}"))?;
    atomic_write(&path, &raw)
}

pub fn load_settings() -> Result<Settings, String> {
    let path = settings_path()?;
    if !path.exists() {
        let settings = Settings::default();
        save_settings(&settings)?;
        return Ok(settings);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Failed to read settings.json: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid settings.json: {e}"))
}

pub fn save_settings(settings: &Settings) -> Result<(), String> {
    let path = settings_path()?;
    let raw =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Serialize error: {e}"))?;
    atomic_write(&path, &raw)
}

pub fn data_dir_path() -> Result<String, String> {
    Ok(app_dir()?.to_string_lossy().to_string())
}


#[cfg(test)]
mod tests {
    use crate::models::{Card, CardStats, Store};
    use chrono::Utc;
    use std::env;
    use uuid::Uuid;

    #[test]
    fn roundtrip_store_in_temp() {
        let dir = env::temp_dir().join(format!("flashcapture-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cards.json");
        let mut store = Store::default();
        let deck_id = store.decks[0].id.clone();
        store.cards.push(Card {
            id: Uuid::new_v4().to_string(),
            deck_id,
            question: "Q?".into(),
            answer: "A".into(),
            tags: vec!["t".into()],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            stats: CardStats::default(),
        });
        let raw = serde_json::to_string_pretty(&store).unwrap();
        std::fs::write(&path, &raw).unwrap();
        let loaded: Store = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(loaded.cards.len(), 1);
        assert_eq!(loaded.cards[0].question, "Q?");
        let _ = std::fs::remove_dir_all(dir);
    }
}
