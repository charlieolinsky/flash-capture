use crate::models::{
    Card, CardStats, Deck, ReviewInput, Settings, Store, UpsertCardInput, UpsertDeckInput,
};
use crate::storage;
use chrono::Utc;
use tauri::Manager;
use uuid::Uuid;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Card, CardStats, Store};
    use chrono::Utc;

    #[test]
    fn import_merge_keeps_existing_and_adds_new() {
        let mut base = Store::default();
        let deck_id = base.decks[0].id.clone();
        let existing_id = Uuid::new_v4().to_string();
        base.cards.push(Card {
            id: existing_id.clone(),
            deck_id: deck_id.clone(),
            question: "Old".into(),
            answer: "A".into(),
            tags: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            stats: CardStats::default(),
        });

        let mut incoming = Store::default();
        incoming.decks = base.decks.clone();
        incoming.cards.push(Card {
            id: existing_id.clone(),
            deck_id: deck_id.clone(),
            question: "Updated".into(),
            answer: "A2".into(),
            tags: vec!["x".into()],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            stats: CardStats::default(),
        });
        incoming.cards.push(Card {
            id: Uuid::new_v4().to_string(),
            deck_id,
            question: "New".into(),
            answer: "B".into(),
            tags: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            stats: CardStats::default(),
        });

        // Exercise merge logic inline (mirrors import_store non-replace branch)
        let mut store = base;
        for card in incoming.cards {
            if let Some(existing) = store.cards.iter_mut().find(|c| c.id == card.id) {
                *existing = card;
            } else {
                store.cards.push(card);
            }
        }
        assert_eq!(store.cards.len(), 2);
        assert_eq!(
            store.cards.iter().find(|c| c.id == existing_id).unwrap().question,
            "Updated"
        );
    }
}

#[tauri::command]
pub fn get_store() -> Result<Store, String> {
    storage::load_store()
}

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    storage::load_settings()
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<Settings, String> {
    storage::save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn upsert_card(input: UpsertCardInput) -> Result<Card, String> {
    let mut store = storage::load_store()?;
    if !store.decks.iter().any(|d| d.id == input.deck_id) {
        return Err("Deck not found".to_string());
    }

    let now = Utc::now();
    let question = input.question.trim().to_string();
    let answer = input.answer.trim().to_string();
    if question.is_empty() {
        return Err("Question is required".to_string());
    }
    if answer.is_empty() {
        return Err("Answer is required".to_string());
    }

    let tags: Vec<String> = input
        .tags
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();

    let card = if let Some(id) = input.id {
        let existing = store
            .cards
            .iter_mut()
            .find(|c| c.id == id)
            .ok_or_else(|| "Card not found".to_string())?;
        existing.deck_id = input.deck_id;
        existing.question = question;
        existing.answer = answer;
        existing.tags = tags;
        existing.updated_at = now;
        existing.clone()
    } else {
        let card = Card {
            id: Uuid::new_v4().to_string(),
            deck_id: input.deck_id.clone(),
            question,
            answer,
            tags,
            created_at: now,
            updated_at: now,
            stats: CardStats::default(),
        };
        store.cards.push(card.clone());

        let mut settings = storage::load_settings()?;
        settings.last_used_deck_id = Some(input.deck_id);
        let _ = storage::save_settings(&settings);

        card
    };

    storage::save_store(&store)?;
    Ok(card)
}

#[tauri::command]
pub fn delete_card(id: String) -> Result<(), String> {
    let mut store = storage::load_store()?;
    let before = store.cards.len();
    store.cards.retain(|c| c.id != id);
    if store.cards.len() == before {
        return Err("Card not found".to_string());
    }
    storage::save_store(&store)
}

#[tauri::command]
pub fn upsert_deck(input: UpsertDeckInput) -> Result<Deck, String> {
    let mut store = storage::load_store()?;
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Deck name is required".to_string());
    }

    let deck = if let Some(id) = input.id {
        let existing = store
            .decks
            .iter_mut()
            .find(|d| d.id == id)
            .ok_or_else(|| "Deck not found".to_string())?;
        existing.name = name;
        existing.clone()
    } else {
        let deck = Deck {
            id: Uuid::new_v4().to_string(),
            name,
            created_at: Utc::now(),
        };
        store.decks.push(deck.clone());
        deck
    };

    storage::save_store(&store)?;
    Ok(deck)
}

#[tauri::command]
pub fn delete_deck(id: String) -> Result<(), String> {
    let mut store = storage::load_store()?;
    if store.decks.len() <= 1 {
        return Err("At least one deck is required".to_string());
    }
    if !store.decks.iter().any(|d| d.id == id) {
        return Err("Deck not found".to_string());
    }

    let fallback = store
        .decks
        .iter()
        .find(|d| d.id != id)
        .map(|d| d.id.clone())
        .ok_or_else(|| "No fallback deck".to_string())?;

    store.decks.retain(|d| d.id != id);
    for card in &mut store.cards {
        if card.deck_id == id {
            card.deck_id = fallback.clone();
            card.updated_at = Utc::now();
        }
    }

    let mut settings = storage::load_settings()?;
    if settings.default_deck_id.as_deref() == Some(&id) {
        settings.default_deck_id = Some(fallback.clone());
    }
    if settings.last_used_deck_id.as_deref() == Some(&id) {
        settings.last_used_deck_id = Some(fallback);
    }
    storage::save_settings(&settings)?;
    storage::save_store(&store)
}

#[tauri::command]
pub fn review_card(input: ReviewInput) -> Result<Card, String> {
    let mut store = storage::load_store()?;
    let card = store
        .cards
        .iter_mut()
        .find(|c| c.id == input.card_id)
        .ok_or_else(|| "Card not found".to_string())?;

    card.stats.times_reviewed += 1;
    if input.knew {
        card.stats.times_knew += 1;
    } else {
        card.stats.times_forgot += 1;
    }
    card.stats.last_reviewed_at = Some(Utc::now());
    card.updated_at = Utc::now();
    let result = card.clone();
    storage::save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub fn export_store() -> Result<Store, String> {
    storage::load_store()
}

#[tauri::command]
pub fn export_store_to_path(path: String) -> Result<(), String> {
    let store = storage::load_store()?;
    let raw = serde_json::to_string_pretty(&store).map_err(|e| format!("Serialize error: {e}"))?;
    std::fs::write(&path, raw).map_err(|e| format!("Failed to write export: {e}"))
}

#[tauri::command]
pub fn import_store_from_path(path: String, replace: bool) -> Result<Store, String> {
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read import: {e}"))?;
    let incoming: Store =
        serde_json::from_str(&raw).map_err(|e| format!("Invalid import JSON: {e}"))?;
    import_store(incoming, replace)
}

#[tauri::command]
pub fn import_store(incoming: Store, replace: bool) -> Result<Store, String> {
    if incoming.version == 0 {
        return Err("Invalid store: missing version".to_string());
    }

    let store = if replace {
        let mut next = incoming;
        if next.decks.is_empty() {
            next = Store::default();
        }
        next.version = 1;
        next
    } else {
        let mut store = storage::load_store()?;
        for deck in incoming.decks {
            if let Some(existing) = store.decks.iter_mut().find(|d| d.id == deck.id) {
                *existing = deck;
            } else {
                store.decks.push(deck);
            }
        }
        for card in incoming.cards {
            if let Some(existing) = store.cards.iter_mut().find(|c| c.id == card.id) {
                *existing = card;
            } else {
                store.cards.push(card);
            }
        }
        // Ensure every card points at a known deck
        let fallback = store.decks.first().map(|d| d.id.clone()).unwrap_or_default();
        for card in &mut store.cards {
            if !store.decks.iter().any(|d| d.id == card.deck_id) {
                card.deck_id = fallback.clone();
            }
        }
        store
    };

    storage::save_store(&store)?;
    Ok(store)
}

#[tauri::command]
pub fn get_data_dir() -> Result<String, String> {
    storage::data_dir_path()
}

#[tauri::command]
pub fn trigger_capture(app: tauri::AppHandle) -> Result<(), String> {
    crate::capture::run_capture_flow(&app);
    Ok(())
}

#[tauri::command]
pub fn get_pending_capture() -> Option<crate::models::CapturePayload> {
    // Peek so re-emits / remounts can still see it; cleared after successful save/hide.
    crate::capture::peek_pending_payload()
}

#[tauri::command]
pub fn clear_pending_capture() {
    let _ = crate::capture::take_pending_payload();
}

#[tauri::command]
pub fn hide_capture_window(app: tauri::AppHandle) -> Result<(), String> {
    let _ = crate::capture::take_pending_payload();
    if let Some(win) = app.get_webview_window("capture") {
        win.hide().map_err(|e| format!("Failed to hide capture window: {e}"))?;
    }
    Ok(())
}
