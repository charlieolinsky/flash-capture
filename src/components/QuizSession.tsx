import { useMemo, useState } from "react";
import type { Card } from "../lib/types";
import MarkdownBody from "./MarkdownBody";

interface Props {
  cards: Card[];
  onReview: (cardId: string, knew: boolean) => Promise<void>;
  onExit: () => void;
}

export default function QuizSession({ cards, onReview, onExit }: Props) {
  const ordered = useMemo(() => {
    return [...cards].sort((a, b) => {
      const aForgot = a.stats.timesForgot - a.stats.timesKnew;
      const bForgot = b.stats.timesForgot - b.stats.timesKnew;
      if (aForgot !== bForgot) return bForgot - aForgot;
      const aLast = a.stats.lastReviewedAt ? Date.parse(a.stats.lastReviewedAt) : 0;
      const bLast = b.stats.lastReviewedAt ? Date.parse(b.stats.lastReviewedAt) : 0;
      return aLast - bLast;
    });
  }, [cards]);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knewCount, setKnewCount] = useState(0);
  const [forgotCount, setForgotCount] = useState(0);
  const [done, setDone] = useState(ordered.length === 0);
  const [busy, setBusy] = useState(false);

  const current = ordered[index];

  async function mark(knew: boolean) {
    if (!current || busy) return;
    setBusy(true);
    try {
      await onReview(current.id, knew);
      if (knew) setKnewCount((n) => n + 1);
      else setForgotCount((n) => n + 1);
      const next = index + 1;
      if (next >= ordered.length) {
        setDone(true);
      } else {
        setIndex(next);
        setFlipped(false);
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="panel quiz-card">
        <h2 style={{ marginTop: 0 }}>Session complete</h2>
        <p className="muted">
          Knew {knewCount} · Forgot {forgotCount} · Total {ordered.length}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1rem" }}>
          <button className="btn btn-primary" onClick={onExit}>
            Back to library
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="empty">
        <p>No cards in this quiz.</p>
        <button className="btn" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <span className="muted" style={{ fontSize: "1rem" }}>
          Card {index + 1} / {ordered.length}
        </span>
        <button className="btn btn-ghost" onClick={onExit}>
          End quiz
        </button>
      </div>
      <div
        className="panel quiz-card"
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest("pre, .md-inline")) return;
          setFlipped((f) => !f);
        }}
      >
        <div className="muted" style={{ marginBottom: "1rem", fontSize: "0.95rem" }}>
          {flipped ? "Answer" : "Question"} · click to flip
        </div>
        <div className="flip-face">
          <MarkdownBody text={flipped ? current.answer : current.question} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", marginTop: "1.25rem" }}>
        {!flipped ? (
          <button className="btn btn-primary" onClick={() => setFlipped(true)}>
            Show answer
          </button>
        ) : (
          <>
            <button className="btn btn-bad" disabled={busy} onClick={() => void mark(false)}>
              Didn't know
            </button>
            <button className="btn btn-good" disabled={busy} onClick={() => void mark(true)}>
              Knew it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
