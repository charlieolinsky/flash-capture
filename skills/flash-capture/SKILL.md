---
name: flash-capture
description: Turn the current coding-agent session into concise FlashCapture flashcards on core concepts, definitions, and patterns. Distill generalizable lessons rather than chat-specific facts, then create cards through the local flashcapture MCP server. Use when the user runs /flash-capture, or asks to make flashcards from this session, capture lessons, turn this chat into cards, or review what we learned.
---

# Flash-capture

Read this session. Extract durable knowledge. Write atomic active-recall cards. Create them with the **flashcapture** MCP server (local stdio, writes `cards.json` on disk).

Do this without waiting for a card-by-card go-ahead. Ask only if the deck name is ambiguous.

## 1. Mine the session

Pull **concepts, definitions, mechanisms, and reusable patterns**. Drop anything that only makes sense inside this chat.

Keep:

- Named ideas and what they mean
- Cause → effect, why a technique works
- Contrasts (A vs B, when to use which)
- Failure modes and the rule that prevents them
- Protocols, APIs, and invariants that will show up again

Drop:

- File paths, SHAs, issue numbers, tool traces
- "What we did in this session" narratives
- One-off bugs, local config, people's names
- Commands that are just this repo's plumbing
- Trivia you could not reuse on a new problem

Rewrite every candidate until a learner who never saw this conversation could study it. If you cannot, discard it.

Prefer 5–15 cards. Go higher only if the session is dense with distinct ideas. Fewer strong cards beat a dump.

## 2. Write cards (learning rules)

Each card is a **cued-recall test**, not a note. The learner must generate the answer, then check it. Recognition, yes/no, and "reread this paragraph" cards fail.

**Minimum information.** One idea per card. Shortest answer that is still correct (a term, a phrase, or at most two sentences). Split compounds: if a card has "and" in the answer, it is probably two cards. Enumerations and sequences become overlapping cloze items, not one recitation.

**Effortful cue.** The question must not leak the answer. Vague prompts ("What did you learn about MCP?") dump too much into one answer. Surface prompts that copy this chat's wording train pattern-match, not transfer.

**Production over recognition.** Prefer "What is X?" / "When do you Y?" / "How does Z work?" over multiple choice. Add a swapped-direction card (term→definition and definition→term) only when both productions matter.

**Why/how, precisely.** For mechanisms, ask a specific why/how ("Why does retrieval practice beat restudy after a delay?") not a fuzzy "Why is testing good?".

**Cloze vs Q&A.**

- Definitions, contrasts, mechanisms → Q&A
- Lists, sequences, sentence-bound facts → one-blank cloze (`… ___ …`)
- Do not cloze a whole clause; one deleted kernel per card
- Cloze of an exact practiced blank does not transfer; if the point is a principle, write a Q&A that asks for the principle

**Card shape.**

| Field | Rule |
|---|---|
| question | One specific prompt; standalone; no chat deixis ("we", "this bug") |
| answer | Minimum information; no lecture |
| deck | Domain name (`Spaced repetition`, `MCP`, `Tauri`), never `Grok session …` |
| tags | 1–3 topic tags (`retrieval`, `stdio`, `webview`) |

Bad → good:

- "What did we change in App.tsx so Refresh stopped flickering?" → "When should a UI show a busy state for a background poll?" / "Only for a user-initiated refresh."
- "Explain MCP." → "What byte framing does Grok Build use for MCP stdio JSON-RPC?" / "Newline-delimited JSON."
- "List every SuperMemo rule we mentioned." → split into atomic items, or overlapping clozes.

## 3. Create via flashcapture MCP

Tools live on the **flashcapture** MCP server (`add_card`, `list_decks`, `list_cards`, `add_deck`, `library_info`). Discover schemas with `search_tool` if needed, then call them.

1. `library_info` / `list_decks` — confirm the server is up. If it is missing, tell the user to run `node cli/flashcapture.mjs install-agents` from the FlashCapture repo.
2. Pick or `add_deck` a domain deck.
3. `list_cards` with `search` on key terms — skip or `update_card` near-duplicates; do not add the same fact twice.
4. `add_card` once per card (`question`, `answer`, `deck`, `tags`).
5. Reply with deck name, count added, count skipped as duplicates, and a one-line list of questions. No need to paste full answers unless the user asks.

If MCP is down, fall back to:

```bash
node cli/flashcapture.mjs cards add -q "…" -a "…" --deck "…" --tags "…"
```

Use the absolute path to this machine's FlashCapture checkout if `cli/flashcapture.mjs` is not on PATH.
