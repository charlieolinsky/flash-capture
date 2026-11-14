import { invoke } from "@tauri-apps/api/core";
import type {
  Card,
  Deck,
  Settings,
  Store,
  UpsertCardInput,
  UpsertDeckInput,
} from "./types";

export const api = {
  getStore: () => invoke<Store>("get_store"),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) =>
    invoke<Settings>("save_settings", { settings }),
  upsertCard: (input: UpsertCardInput) =>
    invoke<Card>("upsert_card", { input }),
  deleteCard: (id: string) => invoke<void>("delete_card", { id }),
  upsertDeck: (input: UpsertDeckInput) =>
    invoke<Deck>("upsert_deck", { input }),
  deleteDeck: (id: string) => invoke<void>("delete_deck", { id }),
  reviewCard: (cardId: string, knew: boolean) =>
    invoke<Card>("review_card", { input: { cardId, knew } }),
  exportStore: () => invoke<Store>("export_store"),
  exportStoreToPath: (path: string) =>
    invoke<void>("export_store_to_path", { path }),
  importStore: (incoming: Store, replace: boolean) =>
    invoke<Store>("import_store", { incoming, replace }),
  importStoreFromPath: (path: string, replace: boolean) =>
    invoke<Store>("import_store_from_path", { path, replace }),
  getDataDir: () => invoke<string>("get_data_dir"),
};
