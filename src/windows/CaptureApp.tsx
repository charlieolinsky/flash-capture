import { listen } from "@tauri-apps/api/event";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { CapturePayload, Deck, Settings } from "../lib/types";

export default function CaptureApp() {
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [deckId, setDeckId] = useState("");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);

  const tagList = useMemo(
    () =>
      tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const applyPayload = (payload: CapturePayload) => {
      setAnswer(payload.answer || "");
      setQuestion("");
      setNotice(payload.notice || null);
      setError(null);
      setTimeout(() => questionRef.current?.focus(), 50);
    };

    (async () => {
      // Listen first so we do not miss an emit that races window creation.
      unlisten = await listen<CapturePayload>("capture-payload", (event) => {
        if (!cancelled) applyPayload(event.payload);
      });

      // Pull any payload already stashed by Rust (covers late listener attach).
      try {
        const pending = await api.getPendingCapture();
        if (!cancelled && pending) applyPayload(pending);
      } catch {
        // ignore — event listener is the primary path
      }

      const [store, settings] = await Promise.all([
        api.getStore(),
        api.getSettings(),
      ]);
      if (cancelled) return;
      setDecks(store.decks);
      const preferred =
        settings.lastUsedDeckId ||
        settings.defaultDeckId ||
        store.decks[0]?.id ||
        "";
      setDeckId(preferred);

      // One more pull after decks load, in case the first was empty during setup.
      try {
        const pending = await api.getPendingCapture();
        if (!cancelled && pending) applyPayload(pending);
      } catch {
        // ignore
      }
    })().catch((e) => {
      if (!cancelled) setError(String(e));
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void api.hideCaptureWindow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      unlisten?.();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim() || !deckId) {
      setError("Question, answer, and deck are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.upsertCard({
        deckId,
        question: question.trim(),
        answer: answer.trim(),
        tags: tagList,
      });
      const settings = await api.getSettings();
      const next: Settings = { ...settings, lastUsedDeckId: deckId };
      await api.saveSettings(next);
      setQuestion("");
      setAnswer("");
      setTagsText("");
      setNotice(null);
      await api.hideCaptureWindow();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "1rem", height: "100%", overflow: "auto" }}>
      <form onSubmit={onSubmit} className="panel" style={{ padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Quick Capture</h1>
            <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
              Highlighted text is the answer. Write the question.
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => void api.hideCaptureWindow()}>
            Esc
          </button>
        </div>

        {notice && (
          <div
            style={{
              marginBottom: "0.75rem",
              padding: "0.65rem 0.75rem",
              borderRadius: 10,
              background: "var(--accent-soft)",
              color: "var(--accent)",
              fontSize: "0.85rem",
            }}
          >
            {notice}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: "0.75rem", color: "var(--bad)", fontSize: "0.9rem" }}>
            {error}
          </div>
        )}

        <label className="muted" style={{ display: "block", marginBottom: 4, fontSize: "0.8rem" }}>
          Question
        </label>
        <textarea
          ref={questionRef}
          className="field"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What should this remind you of?"
          required
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void onSubmit(e as unknown as FormEvent);
            }
          }}
        />

        <label className="muted" style={{ display: "block", margin: "0.75rem 0 4px", fontSize: "0.8rem" }}>
          Answer
        </label>
        <textarea
          className="field"
          rows={5}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Captured text…"
          required
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4, fontSize: "0.8rem" }}>
              Deck
            </label>
            <select className="field" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4, fontSize: "0.8rem" }}>
              Tags (comma-separated)
            </label>
            <input
              className="field"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="rust, ownership"
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button type="button" className="btn" onClick={() => void api.hideCaptureWindow()}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save card (⌘/Ctrl+Enter)"}
          </button>
        </div>
      </form>
    </div>
  );
}
