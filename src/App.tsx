import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CardEditor from "./components/CardEditor";
import MarkdownBody from "./components/MarkdownBody";
import QuizSession from "./components/QuizSession";
import SettingsPanel from "./components/SettingsPanel";
import { api } from "./lib/api";
import type { Card, Deck, Settings, SortKey, Store, ViewMode } from "./lib/types";

function applyTheme(theme: string) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function storeFingerprint(store: Store, settings: Settings): string {
  return `${store.cards.length}:${store.decks.length}:${store.cards.map((c) => c.updatedAt).join(",")}:${settings.hotkey}:${settings.theme}`;
}

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<ViewMode>("library");
  const [selectedDeckId, setSelectedDeckId] = useState<string | "all">("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [editing, setEditing] = useState<Card | null | undefined>(undefined);
  // undefined = closed, null = new card, Card = edit
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const fingerprintRef = useRef<string>("");

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    setSyncing(true);
    try {
      const [nextStore, nextSettings] = await Promise.all([
        api.getStore(),
        api.getSettings(),
      ]);
      const nextFp = storeFingerprint(nextStore, nextSettings);
      if (opts?.force || nextFp !== fingerprintRef.current) {
        fingerprintRef.current = nextFp;
        setStore(nextStore);
        setSettings(nextSettings);
        applyTheme(nextSettings.theme);
      }
      setLastSyncedAt(new Date());
      setError(null);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    refresh({ force: true })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [refresh]);

  // Stay fresh: file-watcher events from Rust, focus/visibility, and a light poll backup.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const reload = () => {
      void refresh().catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", onVisibility);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 1500);

    void listen("store-changed", () => reload()).then((fn) => {
      unlisten = fn;
    });

    return () => {
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(poll);
      unlisten?.();
    };
  }, [refresh]);

  const allTags = useMemo(() => {
    if (!store) return [] as string[];
    const set = new Set<string>();
    for (const card of store.cards) {
      for (const tag of card.tags) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [store]);

  const filteredCards = useMemo(() => {
    if (!store) return [] as Card[];
    let cards = [...store.cards];
    if (selectedDeckId !== "all") {
      cards = cards.filter((c) => c.deckId === selectedDeckId);
    }
    if (selectedTag) {
      cards = cards.filter((c) => c.tags.includes(selectedTag));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      cards = cards.filter(
        (c) =>
          c.question.toLowerCase().includes(q) ||
          c.answer.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    cards.sort((a, b) => {
      switch (sortKey) {
        case "created":
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
        case "forgot":
          return b.stats.timesForgot - a.stats.timesForgot;
        case "reviewed":
          return b.stats.timesReviewed - a.stats.timesReviewed;
        case "updated":
        default:
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }
    });
    return cards;
  }, [store, selectedDeckId, selectedTag, search, sortKey]);

  async function saveCard(data: {
    id?: string;
    deckId: string;
    question: string;
    answer: string;
    tags: string[];
  }) {
    await api.upsertCard(data);
    await refresh();
    setEditing(undefined);
  }

  async function removeCard(id: string) {
    if (!confirm("Delete this flashcard?")) return;
    await api.deleteCard(id);
    await refresh();
  }

  async function addDeck() {
    const name = prompt("New deck name");
    if (!name?.trim()) return;
    await api.upsertDeck({ name: name.trim() });
    await refresh();
  }

  async function renameDeck(deck: Deck) {
    const name = prompt("Rename deck", deck.name);
    if (!name?.trim()) return;
    await api.upsertDeck({ id: deck.id, name: name.trim() });
    await refresh();
  }

  async function removeDeck(deck: Deck) {
    if (!confirm(`Delete deck "${deck.name}"? Cards move to another deck.`)) return;
    await api.deleteDeck(deck.id);
    if (selectedDeckId === deck.id) setSelectedDeckId("all");
    await refresh();
  }

  async function handleSettingsChange(next: Settings) {
    const saved = await api.saveSettings(next);
    setSettings(saved);
    applyTheme(saved.theme);
  }

  if (loading) {
    return <div className="empty">Loading FlashCapture…</div>;
  }

  if (!store || !settings) {
    return <div className="empty">Failed to load data{error ? `: ${error}` : ""}</div>;
  }

  const defaultDeckId =
    settings.lastUsedDeckId ||
    settings.defaultDeckId ||
    store.decks[0]?.id ||
    "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-title">FlashCapture</div>
          <div className="muted" style={{ fontSize: "0.92rem", marginTop: "0.2rem" }}>
            Capture · Browse · Quiz
          </div>
        </div>

        <nav className="sidebar-section">
          <button
            className={`nav-item ${view === "library" ? "active" : ""}`}
            onClick={() => setView("library")}
          >
            Library
          </button>
          <button
            className={`nav-item ${view === "quiz" ? "active" : ""}`}
            onClick={() => setView("quiz")}
          >
            Quiz
          </button>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => setView("settings")}
          >
            Settings
          </button>
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="sidebar-label">Decks</span>
            <button
              type="button"
              className="icon-btn"
              title="New deck"
              aria-label="New deck"
              onClick={() => void addDeck()}
            >
              +
            </button>
          </div>
          <button
            className={`nav-item ${selectedDeckId === "all" ? "active" : ""}`}
            onClick={() => setSelectedDeckId("all")}
          >
            All cards
          </button>
          {store.decks.map((deck) => (
            <div key={deck.id} className="deck-row">
              <button
                className={`nav-item ${selectedDeckId === deck.id ? "active" : ""}`}
                onClick={() => setSelectedDeckId(deck.id)}
                onDoubleClick={() => void renameDeck(deck)}
                title="Double-click to rename"
              >
                {deck.name}
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                title="Delete deck"
                aria-label={`Delete deck ${deck.name}`}
                onClick={() => void removeDeck(deck)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-label">Tags</span>
            </div>
            <div className="tag-row" style={{ marginTop: 0 }}>
              <button
                type="button"
                className={`tag ${selectedTag ? "tag-muted" : "active"}`}
                onClick={() => setSelectedTag(null)}
              >
                all
              </button>
              {allTags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className={`tag ${selectedTag === tag ? "active" : ""}`}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <button
            className="btn"
            style={{ width: "100%" }}
            title="Reload cards from disk"
            disabled={syncing}
            onClick={() => void refresh({ force: true }).catch((e) => setError(String(e)))}
          >
            {syncing ? "Refreshing…" : "Refresh library"}
          </button>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => void api.triggerCapture()}>
            Quick Capture
          </button>
          <p className="muted sidebar-meta">
            {store.cards.length} cards · {settings.hotkey}
            {lastSyncedAt
              ? ` · ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : ""}
          </p>
        </div>
      </aside>

      <main className="main-pane">
        {view === "library" && (
          <>
            <div className="toolbar">
              <input
                className="field"
                style={{ maxWidth: 360, flex: "1 1 240px" }}
                placeholder="Search cards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="field" style={{ maxWidth: 200 }} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="updated">Sort: updated</option>
                <option value="created">Sort: created</option>
                <option value="forgot">Sort: most forgotten</option>
                <option value="reviewed">Sort: most reviewed</option>
              </select>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => setView("quiz")}>
                Quiz filtered ({filteredCards.length})
              </button>
              <button className="btn btn-primary" onClick={() => setEditing(null)}>
                New card
              </button>
            </div>
            <div className="content">
              {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
              {editing !== undefined && (
                <CardEditor
                  card={editing}
                  decks={store.decks}
                  defaultDeckId={selectedDeckId === "all" ? defaultDeckId : selectedDeckId}
                  onSave={saveCard}
                  onCancel={() => setEditing(undefined)}
                />
              )}
              {filteredCards.length === 0 ? (
                <div className="empty">
                  <h3>No cards yet</h3>
                  <p>
                    Highlight text anywhere and press <strong>{settings.hotkey}</strong>, or create a card
                    manually.
                  </p>
                </div>
              ) : (
                filteredCards.map((card) => {
                  const deckName = store.decks.find((d) => d.id === card.deckId)?.name ?? "Unknown";
                  return (
                    <div key={card.id} className="card-row">
                      <div>
                        <div className="card-title">
                          <MarkdownBody text={card.question} />
                        </div>
                        <div className="muted card-preview">
                          <MarkdownBody text={card.answer} />
                        </div>
                        <div className="tag-row">
                          <span className="tag tag-static">{deckName}</span>
                          {card.tags.map((t) => (
                            <span key={t} className="tag tag-static">
                              {t}
                            </span>
                          ))}
                          <span className="muted" style={{ fontSize: "0.9rem" }}>
                            knew {card.stats.timesKnew} · forgot {card.stats.timesForgot}
                          </span>
                        </div>
                      </div>
                      <div className="card-row-actions">
                        <button className="btn" onClick={() => setEditing(card)}>
                          Edit
                        </button>
                        <button className="btn" onClick={() => void removeCard(card.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {view === "quiz" && (
          <div className="content">
            <QuizSession
              cards={filteredCards}
              onReview={async (cardId, knew) => {
                await api.reviewCard(cardId, knew);
                await refresh();
              }}
              onExit={() => setView("library")}
            />
          </div>
        )}

        {view === "settings" && (
          <div className="content">
            <SettingsPanel
              settings={settings}
              decks={store.decks}
              onSettingsChange={handleSettingsChange}
              onStoreChange={(next) => setStore(next)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
