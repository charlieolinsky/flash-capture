import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as lib from "./lib.mjs";

function tempDir() {
  const dir = path.join(os.tmpdir(), `flashcapture-cli-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test("creates a default General deck and adds a card", () => {
  const dir = tempDir();
  const card = lib.upsertCard(
    { question: "What is Tauri?", answer: "A native webview toolkit", tags: "rust, tauri" },
    dir,
  );
  assert.equal(card.question, "What is Tauri?");
  assert.equal(card.deckName, "General");
  assert.deepEqual(card.tags, ["rust", "tauri"]);
  assert.equal(lib.listCards({}, dir).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("add/rename/delete decks and reassign cards", () => {
  const dir = tempDir();
  lib.loadStore(dir);
  const rust = lib.upsertDeck({ name: "Rust" }, dir);
  const card = lib.upsertCard(
    { question: "Q", answer: "A", deck: "Rust" },
    dir,
  );
  assert.equal(card.deckId, rust.id);
  lib.upsertDeck({ id: rust.id, name: "Systems" }, dir);
  assert.equal(lib.findDeck(lib.loadStore(dir), "Systems")?.id, rust.id);
  lib.deleteDeck("Systems", dir);
  const moved = lib.getCard(card.id, dir);
  assert.equal(moved.deckName, "General");
  assert.throws(() => lib.deleteDeck("General", dir), /At least one deck/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("search, update, and delete cards", () => {
  const dir = tempDir();
  const a = lib.upsertCard({ question: "Borrow checker", answer: "Rust memory safety", tags: ["rust"] }, dir);
  lib.upsertCard({ question: "Hooks", answer: "React state", tags: ["react"] }, dir);
  const found = lib.listCards({ search: "borrow" }, dir);
  assert.equal(found.length, 1);
  assert.equal(found[0].id, a.id);
  const updated = lib.upsertCard({ id: a.id, answer: "Compile-time memory safety" }, dir);
  assert.equal(updated.answer, "Compile-time memory safety");
  assert.equal(updated.question, "Borrow checker");
  lib.deleteCard(a.id, dir);
  assert.equal(lib.listCards({ tag: "rust" }, dir).length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("import merge keeps existing and adds new", () => {
  const dir = tempDir();
  const existing = lib.upsertCard({ question: "Old", answer: "A" }, dir);
  const store = lib.loadStore(dir);
  const incoming = {
    version: 1,
    decks: store.decks,
    cards: [
      { ...existing, question: "Updated", answer: "A2", tags: ["x"] },
      {
        id: randomUUID(),
        deckId: store.decks[0].id,
        question: "New",
        answer: "B",
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: { timesReviewed: 0, timesKnew: 0, timesForgot: 0, lastReviewedAt: null },
      },
    ],
  };
  lib.importStore(incoming, { replace: false }, dir);
  const cards = lib.listCards({}, dir);
  assert.equal(cards.length, 2);
  assert.equal(cards.find((c) => c.id === existing.id)?.question, "Updated");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("FLASHCAPTURE_DATA_DIR selects the library path", () => {
  const dir = tempDir();
  const prev = process.env.FLASHCAPTURE_DATA_DIR;
  process.env.FLASHCAPTURE_DATA_DIR = dir;
  try {
    assert.equal(lib.defaultDataDir(), path.resolve(dir));
    lib.upsertCard({ question: "Env", answer: "Path" });
    assert.ok(fs.existsSync(path.join(dir, "cards.json")));
  } finally {
    if (prev === undefined) delete process.env.FLASHCAPTURE_DATA_DIR;
    else process.env.FLASHCAPTURE_DATA_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("atomic write leaves a backup", () => {
  const dir = tempDir();
  lib.upsertCard({ question: "One", answer: "1" }, dir);
  lib.upsertCard({ question: "Two", answer: "2" }, dir);
  assert.ok(fs.existsSync(path.join(dir, "cards.json.bak")));
  fs.rmSync(dir, { recursive: true, force: true });
});
