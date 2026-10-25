import { FormEvent, useEffect, useState } from "react";
import type { Card, Deck } from "../lib/types";

interface Props {
  card?: Card | null;
  decks: Deck[];
  defaultDeckId: string;
  onSave: (data: {
    id?: string;
    deckId: string;
    question: string;
    answer: string;
    tags: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

export default function CardEditor({
  card,
  decks,
  defaultDeckId,
  onSave,
  onCancel,
}: Props) {
  const [question, setQuestion] = useState(card?.question ?? "");
  const [answer, setAnswer] = useState(card?.answer ?? "");
  const [deckId, setDeckId] = useState(card?.deckId ?? defaultDeckId);
  const [tagsText, setTagsText] = useState(card?.tags.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuestion(card?.question ?? "");
    setAnswer(card?.answer ?? "");
    setDeckId(card?.deckId ?? defaultDeckId);
    setTagsText(card?.tags.join(", ") ?? "");
  }, [card, defaultDeckId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: card?.id,
        deckId,
        question: question.trim(),
        answer: answer.trim(),
        tags: tagsText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" style={{ padding: "1rem", marginBottom: "1rem" }} onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>{card ? "Edit card" : "New card"}</h3>
      {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
      <label className="muted" style={{ fontSize: "0.8rem" }}>
        Question
      </label>
      <textarea className="field" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} required />
      <label className="muted" style={{ fontSize: "0.8rem", display: "block", marginTop: "0.75rem" }}>
        Answer
      </label>
      <textarea className="field" rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
        <div>
          <label className="muted" style={{ fontSize: "0.8rem" }}>
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
          <label className="muted" style={{ fontSize: "0.8rem" }}>
            Tags
          </label>
          <input className="field" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="comma, separated" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
