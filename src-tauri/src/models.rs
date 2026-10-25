use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardStats {
    pub times_reviewed: u32,
    pub times_knew: u32,
    pub times_forgot: u32,
    pub last_reviewed_at: Option<DateTime<Utc>>,
}

impl Default for CardStats {
    fn default() -> Self {
        Self {
            times_reviewed: 0,
            times_knew: 0,
            times_forgot: 0,
            last_reviewed_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    pub deck_id: String,
    pub question: String,
    pub answer: String,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub stats: CardStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    pub version: u32,
    pub decks: Vec<Deck>,
    pub cards: Vec<Card>,
}

impl Default for Store {
    fn default() -> Self {
        let now = Utc::now();
        let deck_id = Uuid::new_v4().to_string();
        Self {
            version: 1,
            decks: vec![Deck {
                id: deck_id,
                name: "General".to_string(),
                created_at: now,
            }],
            cards: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub default_deck_id: Option<String>,
    pub last_used_deck_id: Option<String>,
    pub theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            hotkey: "CommandOrControl+Shift+F".to_string(),
            #[cfg(not(target_os = "macos"))]
            hotkey: "CommandOrControl+Shift+F".to_string(),
            default_deck_id: None,
            last_used_deck_id: None,
            theme: "system".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCardInput {
    pub id: Option<String>,
    pub deck_id: String,
    pub question: String,
    pub answer: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDeckInput {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInput {
    pub card_id: String,
    pub knew: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePayload {
    pub answer: String,
    pub from_selection: bool,
    pub notice: Option<String>,
}
