export interface CardStats {
  timesReviewed: number;
  timesKnew: number;
  timesForgot: number;
  lastReviewedAt: string | null;
}

export interface Deck {
  id: string;
  name: string;
  createdAt: string;
}

export interface Card {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  stats: CardStats;
}

export interface Store {
  version: number;
  decks: Deck[];
  cards: Card[];
}

export interface Settings {
  hotkey: string;
  defaultDeckId: string | null;
  lastUsedDeckId: string | null;
  theme: "system" | "light" | "dark" | string;
}

export interface UpsertCardInput {
  id?: string;
  deckId: string;
  question: string;
  answer: string;
  tags: string[];
}

export interface UpsertDeckInput {
  id?: string;
  name: string;
}

export interface CapturePayload {
  answer: string;
  fromSelection: boolean;
  notice?: string | null;
}

export type SortKey = "created" | "updated" | "forgot" | "reviewed";
export type ViewMode = "library" | "quiz" | "settings";
