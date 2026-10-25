import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Deck, Settings, Store } from "../lib/types";

interface Props {
  settings: Settings;
  decks: Deck[];
  onSettingsChange: (settings: Settings) => Promise<void>;
  onStoreChange: (store: Store) => void;
}

export default function SettingsPanel({
  settings,
  decks,
  onSettingsChange,
  onStoreChange,
}: Props) {
  const [hotkey, setHotkey] = useState(settings.hotkey);
  const [theme, setTheme] = useState(settings.theme);
  const [defaultDeckId, setDefaultDeckId] = useState(settings.defaultDeckId || decks[0]?.id || "");
  const [dataDir, setDataDir] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHotkey(settings.hotkey);
    setTheme(settings.theme);
    setDefaultDeckId(settings.defaultDeckId || decks[0]?.id || "");
  }, [settings, decks]);

  useEffect(() => {
    api.getDataDir().then(setDataDir).catch(() => setDataDir("(unavailable)"));
  }, []);

  async function saveSettings() {
    setError(null);
    setMessage(null);
    try {
      const next: Settings = {
        ...settings,
        hotkey: hotkey.trim() || "CommandOrControl+Shift+F",
        theme,
        defaultDeckId: defaultDeckId || null,
      };
      await onSettingsChange(next);
      await api.reregisterHotkey();
      setMessage("Settings saved. Hotkey re-registered.");
    } catch (e) {
      setError(String(e));
    }
  }

  async function exportJson() {
    setError(null);
    setMessage(null);
    try {
      const path = await save({
        defaultPath: "flashcapture-export.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportStoreToPath(path);
      setMessage(`Exported to ${path}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function importJson(replace: boolean) {
    setError(null);
    setMessage(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const store = await api.importStoreFromPath(path, replace);
      onStoreChange(store);
      setMessage(replace ? "Replaced library from import." : "Merged import into library.");
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      {message && <p style={{ color: "var(--good)" }}>{message}</p>}
      {error && <p style={{ color: "var(--bad)" }}>{error}</p>}

      <div className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Capture hotkey</h3>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Default is <code>CommandOrControl+Shift+F</code>. On macOS, grant Accessibility so FlashCapture can
          simulate Copy for your selection. If you run via <code>npm run tauri dev</code>, enable Accessibility
          for your <strong>terminal app</strong> (Terminal / iTerm / Cursor) as well as FlashCapture.
        </p>
        <input className="field" value={hotkey} onChange={(e) => setHotkey(e.target.value)} />
        <div style={{ marginTop: "0.75rem" }}>
          <label className="muted" style={{ fontSize: "0.8rem" }}>
            Default deck
          </label>
          <select className="field" value={defaultDeckId} onChange={(e) => setDefaultDeckId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <label className="muted" style={{ fontSize: "0.8rem" }}>
            Theme
          </label>
          <select className="field" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={() => void saveSettings()}>
          Save settings
        </button>
      </div>

      <div className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Import / Export</h3>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Move flashcards between devices with a single JSON file.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button className="btn btn-primary" onClick={() => void exportJson()}>
            Export JSON
          </button>
          <button className="btn" onClick={() => void importJson(false)}>
            Import merge
          </button>
          <button
            className="btn"
            onClick={() => {
              if (confirm("Replace your entire library with the imported file?")) {
                void importJson(true);
              }
            }}
          >
            Import replace
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Local data</h3>
        <p className="muted" style={{ fontSize: "0.9rem", wordBreak: "break-all" }}>
          {dataDir}
        </p>
        <button className="btn" onClick={() => void api.triggerCapture()}>
          Test Quick Capture
        </button>
      </div>
    </div>
  );
}
