import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function defaultDataDir() {
  const override = (process.env.FLASHCAPTURE_DATA_DIR || "").trim();
  if (override) return path.resolve(override);
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "flashcapture");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "flashcapture",
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
    "flashcapture",
  );
}

export function storePaths(dataDir = defaultDataDir()) {
  return {
    dir: dataDir,
    cards: path.join(dataDir, "cards.json"),
    settings: path.join(dataDir, "settings.json"),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function defaultStore() {
  const id = randomUUID();
  return {
    version: 1,
    decks: [{ id, name: "General", createdAt: nowIso() }],
    cards: [],
  };
}

function defaultSettings() {
  return {
    hotkey: "CommandOrControl+Shift+F",
    defaultDeckId: null,
    lastUsedDeckId: null,
    theme: "system",
  };
}

function atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents);
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath.replace(/\.json$/, "")}.json.bak`);
  }
  fs.renameSync(tmp, filePath);
}

export function loadStore(dataDir = defaultDataDir()) {
  const { cards } = storePaths(dataDir);
  if (!fs.existsSync(cards)) {
    const store = defaultStore();
    saveStore(store, dataDir);
    return store;
  }
  const raw = fs.readFileSync(cards, "utf8");
  return JSON.parse(raw);
}

export function saveStore(store, dataDir = defaultDataDir()) {
  const { cards } = storePaths(dataDir);
  atomicWrite(cards, `${JSON.stringify(store, null, 2)}\n`);
}

export function loadSettings(dataDir = defaultDataDir()) {
  const { settings } = storePaths(dataDir);
  if (!fs.existsSync(settings)) {
    const next = defaultSettings();
    saveSettings(next, dataDir);
    return next;
  }
  return JSON.parse(fs.readFileSync(settings, "utf8"));
}

export function saveSettings(settings, dataDir = defaultDataDir()) {
  const { settings: settingsPath } = storePaths(dataDir);
  atomicWrite(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

function normalizeTags(tags) {
  const list = Array.isArray(tags)
    ? tags
    : String(tags || "")
        .split(",")
        .map((t) => t.trim());
  return [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
}

export function findDeck(store, idOrName) {
  if (!idOrName) return undefined;
  const key = String(idOrName).trim();
  const byId = store.decks.find((d) => d.id === key);
  if (byId) return byId;
  const lower = key.toLowerCase();
  const matches = store.decks.filter((d) => d.name.toLowerCase() === lower);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Deck name "${key}" is ambiguous; use a deck id`);
  }
  return undefined;
}

function requireDeck(store, idOrName) {
  const deck = findDeck(store, idOrName);
  if (!deck) throw new Error(`Deck not found: ${idOrName}`);
  return deck;
}

export function listDecks(dataDir = defaultDataDir()) {
  return loadStore(dataDir).decks;
}

export function upsertDeck({ id, name }, dataDir = defaultDataDir()) {
  const store = loadStore(dataDir);
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Deck name is required");

  if (id) {
    const existing = store.decks.find((d) => d.id === id);
    if (!existing) throw new Error("Deck not found");
    existing.name = trimmed;
    saveStore(store, dataDir);
    return existing;
  }

  const deck = { id: randomUUID(), name: trimmed, createdAt: nowIso() };
  store.decks.push(deck);
  saveStore(store, dataDir);
  return deck;
}

export function deleteDeck(idOrName, dataDir = defaultDataDir()) {
  const store = loadStore(dataDir);
  if (store.decks.length <= 1) throw new Error("At least one deck is required");
  const deck = requireDeck(store, idOrName);
  const fallback = store.decks.find((d) => d.id !== deck.id);
  if (!fallback) throw new Error("No fallback deck");

  store.decks = store.decks.filter((d) => d.id !== deck.id);
  const now = nowIso();
  for (const card of store.cards) {
    if (card.deckId === deck.id) {
      card.deckId = fallback.id;
      card.updatedAt = now;
    }
  }

  const settings = loadSettings(dataDir);
  if (settings.defaultDeckId === deck.id) settings.defaultDeckId = fallback.id;
  if (settings.lastUsedDeckId === deck.id) settings.lastUsedDeckId = fallback.id;
  saveSettings(settings, dataDir);
  saveStore(store, dataDir);
  return { movedTo: fallback };
}

export function listCards(
  { deck, tag, search, limit } = {},
  dataDir = defaultDataDir(),
) {
  const store = loadStore(dataDir);
  let cards = [...store.cards];
  if (deck) {
    const d = requireDeck(store, deck);
    cards = cards.filter((c) => c.deckId === d.id);
  }
  if (tag) {
    const t = String(tag).toLowerCase();
    cards = cards.filter((c) => c.tags.some((x) => x.toLowerCase() === t));
  }
  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    cards = cards.filter(
      (c) =>
        c.question.toLowerCase().includes(q) ||
        c.answer.toLowerCase().includes(q) ||
        c.tags.some((x) => x.toLowerCase().includes(q)),
    );
  }
  cards.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  if (limit && Number(limit) > 0) cards = cards.slice(0, Number(limit));
  return cards.map((card) => ({
    ...card,
    deckName: store.decks.find((d) => d.id === card.deckId)?.name ?? "Unknown",
  }));
}

export function getCard(id, dataDir = defaultDataDir()) {
  const store = loadStore(dataDir);
  const card = store.cards.find((c) => c.id === id);
  if (!card) throw new Error("Card not found");
  return {
    ...card,
    deckName: store.decks.find((d) => d.id === card.deckId)?.name ?? "Unknown",
  };
}

export function upsertCard(input, dataDir = defaultDataDir()) {
  const store = loadStore(dataDir);
  const settings = loadSettings(dataDir);
  const question = String(input.question ?? "").trim();
  const answer = String(input.answer ?? "").trim();
  if (!input.id && !question) throw new Error("Question is required");
  if (!input.id && !answer) throw new Error("Answer is required");

  let deckId = input.deckId || input.deck;
  if (!deckId) {
    deckId =
      settings.lastUsedDeckId ||
      settings.defaultDeckId ||
      store.decks[0]?.id;
  } else {
    deckId = requireDeck(store, deckId).id;
  }
  if (!store.decks.some((d) => d.id === deckId)) throw new Error("Deck not found");

  const tags = input.tags === undefined ? undefined : normalizeTags(input.tags);
  const now = nowIso();

  if (input.id) {
    const existing = store.cards.find((c) => c.id === input.id);
    if (!existing) throw new Error("Card not found");
    if (question) existing.question = question;
    if (answer) existing.answer = answer;
    if (deckId) existing.deckId = deckId;
    if (tags) existing.tags = tags;
    existing.updatedAt = now;
    saveStore(store, dataDir);
    return getCard(existing.id, dataDir);
  }

  const card = {
    id: randomUUID(),
    deckId,
    question,
    answer,
    tags: tags ?? [],
    createdAt: now,
    updatedAt: now,
    stats: {
      timesReviewed: 0,
      timesKnew: 0,
      timesForgot: 0,
      lastReviewedAt: null,
    },
  };
  store.cards.push(card);
  settings.lastUsedDeckId = deckId;
  saveSettings(settings, dataDir);
  saveStore(store, dataDir);
  return getCard(card.id, dataDir);
}

export function deleteCard(id, dataDir = defaultDataDir()) {
  const store = loadStore(dataDir);
  const before = store.cards.length;
  store.cards = store.cards.filter((c) => c.id !== id);
  if (store.cards.length === before) throw new Error("Card not found");
  saveStore(store, dataDir);
}

export function importStore(incoming, { replace = false } = {}, dataDir = defaultDataDir()) {
  if (!incoming || incoming.version === 0) {
    throw new Error("Invalid store: missing version");
  }

  let store;
  if (replace) {
    store = incoming;
    if (!store.decks?.length) store = defaultStore();
    store.version = 1;
  } else {
    store = loadStore(dataDir);
    for (const deck of incoming.decks || []) {
      const existing = store.decks.find((d) => d.id === deck.id);
      if (existing) Object.assign(existing, deck);
      else store.decks.push(deck);
    }
    for (const card of incoming.cards || []) {
      const existing = store.cards.find((c) => c.id === card.id);
      if (existing) Object.assign(existing, card);
      else store.cards.push(card);
    }
    const fallback = store.decks[0]?.id || "";
    for (const card of store.cards) {
      if (!store.decks.some((d) => d.id === card.deckId)) card.deckId = fallback;
    }
  }

  saveStore(store, dataDir);
  return store;
}

export function exportStore(filePath, dataDir = defaultDataDir()) {
  const store = loadStore(dataDir);
  if (filePath) {
    atomicWrite(path.resolve(filePath), `${JSON.stringify(store, null, 2)}\n`);
  }
  return store;
}

export function importStoreFromPath(filePath, { replace = false } = {}, dataDir = defaultDataDir()) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  const incoming = JSON.parse(raw);
  return importStore(incoming, { replace }, dataDir);
}

export function summarizeStore(dataDir = defaultDataDir()) {
  const store = loadStore(dataDir);
  return {
    dataDir: storePaths(dataDir).dir,
    decks: store.decks.length,
    cards: store.cards.length,
  };
}
