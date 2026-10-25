# FlashCapture

<p align="center">
  <img src="assets/flashcapture-logo.png" alt="FlashCapture logo" width="128" height="128" />
</p>

Lightweight desktop flashcards for learning while you work. Highlight text anywhere, hit a global hotkey, write a quick question, and save a card locally.

**macOS primary · MIT licensed**

> **Notice:** This project was built with AI assistance (Grok Build). Treat it as an early prototype: review the code before relying on it, and expect rough edges.
>
> **Windows:** The app is written to target Windows as well as macOS, but **Windows builds and runtime behavior are untested** as of this release. macOS is the supported / verified platform today.

## Features

- **Quick Capture** — global hotkey treats your selection as the card **answer**, then opens a popup for the **question**
- **Decks + tags** — organize, filter, and search
- **Quiz** — flip cards and mark Knew / Didn't know
- **Portable JSON** — export/import your library between machines
- **Tray app** — stays in the menu bar; closing the window hides to tray
- **Live sync** — library reloads when `cards.json` changes (CLI / other tools)

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- macOS (verified). Windows may work via Tauri but is **untested**.

### macOS Accessibility

FlashCapture simulates `⌘C` to grab the current selection. Grant **Accessibility**:

1. **System Settings → Privacy & Security → Accessibility**
2. Enable **FlashCapture** (or your terminal / IDE when running `tauri dev`)

Without Accessibility, capture falls back to the current clipboard contents.

## Develop

```bash
git clone https://github.com/charlieolinsky/flash-capture.git
cd flash-capture
npm install
npm run tauri dev
```

Default capture hotkey: `CommandOrControl+Shift+F` (`⌘⇧F` on Mac, `Ctrl+Shift+F` on Windows).

## Build

```bash
npm run tauri build
```

Artifacts land under `src-tauri/target/release/bundle/`:

| Platform | Output |
|----------|--------|
| macOS | `macos/FlashCapture.app`, `dmg/*.dmg` (verified) |
| Windows | `.msi` / `.exe` when built on Windows (**untested**) |

## Data location

Cards and settings are plain JSON in the OS app data directory:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/flashcapture/` |
| Windows | `%APPDATA%\flashcapture\` |
| Linux | `~/.local/share/flashcapture/` |

Files:

- `cards.json` — decks and cards
- `settings.json` — hotkey, theme, default deck
- `cards.json.bak` — previous write backup

Override with `FLASHCAPTURE_DATA_DIR` when using the companion CLI.

## JSON schema (export)

```json
{
  "version": 1,
  "decks": [{ "id": "…", "name": "General", "createdAt": "…" }],
  "cards": [
    {
      "id": "…",
      "deckId": "…",
      "question": "…",
      "answer": "…",
      "tags": ["rust"],
      "createdAt": "…",
      "updatedAt": "…",
      "stats": {
        "timesReviewed": 0,
        "timesKnew": 0,
        "timesForgot": 0,
        "lastReviewedAt": null
      }
    }
  ]
}
```

Use **Settings → Export JSON** / **Import merge** (or **Import replace**) to move libraries between devices.

## Tray menu

- **Open Library** — show the main window
- **Quick Capture (clipboard)** — open capture with current clipboard text
- **Quit** — exit the app

## Tech stack

- [Tauri 2](https://tauri.app/) + React + TypeScript + Vite + Tailwind CSS
- Local JSON storage (no account, no cloud)

## License

[MIT](LICENSE)
