# FlashCapture

<p align="center">
  <img src="assets/flashcapture-logo.png" alt="FlashCapture logo" width="128" height="128" />
</p>

A local flashcard library for coding agents. Grok Build, Claude Code, Copilot, and Cursor write cards from the current session. The desktop app is for browsing, editing, and quiz.

All data stays on disk. No clipboard access, no Accessibility, no global hotkeys, no network.

**macOS primary · MIT licensed**

> **Notice:** This project was built with AI assistance (Grok Build). Treat it as an early prototype: review the code before relying on it, and expect rough edges.
>
> **Windows:** The app is written to target Windows as well as macOS, but **Windows builds and runtime behavior are untested** as of this release. macOS is the supported / verified platform today.

## Start here (agents)

From a clone of this repo (Node 18+):

```bash
npm install
node cli/flashcapture.mjs install-agents
```

That writes user-scope MCP config and copies `skills/flash-capture` for Grok Build and Claude Code. It merges FlashCapture into Cursor, VS Code / Copilot Chat, and Copilot CLI configs without replacing other servers.

Then in a coding session run `/flash-capture` (or ask the agent to turn the session into cards). Cards land in local `cards.json`.

Manual MCP (if you skip the installer):

```json
{
  "mcpServers": {
    "flashcapture": {
      "command": "node",
      "args": ["/absolute/path/to/flash-capture/cli/flashcapture.mjs", "mcp"]
    }
  }
}
```

VS Code / Copilot Chat uses a top-level `servers` key and `"type": "stdio"` in the user `mcp.json`.

Tools: `add_card`, `list_cards`, `get_card`, `update_card`, `delete_card`, `list_decks`, `add_deck`, `rename_deck`, `delete_deck`, `library_info`.

## CLI

```bash
node cli/flashcapture.mjs cards add -q "What is Tauri?" -a "A toolkit for native webview apps" --deck General --tags rust
node cli/flashcapture.mjs cards list --search tauri
node cli/flashcapture.mjs data-dir
```

`FLASHCAPTURE_DATA_DIR` or `--data-dir` selects the library. The desktop app, CLI, and MCP share that directory. The library window reloads when `cards.json` changes.

## Desktop library

```bash
npm run tauri dev
```

Browse decks, search, edit, quiz (Knew / Didn't know), export and import JSON. Close quits.

```bash
npm run tauri build
```

Artifacts land under `src-tauri/target/release/bundle/`.

## Data location

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/flashcapture/` |
| Windows | `%APPDATA%\flashcapture\` |
| Linux | `~/.local/share/flashcapture/` |

- `cards.json` — decks and cards
- `settings.json` — theme, default deck
- `cards.json.bak` — previous write backup

## What this binary does not do

- Read or write the clipboard
- Inject keystrokes or request Accessibility
- Register global shortcuts
- Open the network (no updater, no telemetry)
- Run a menu-bar / tray resident

It reads and writes JSON under the data directory, and uses the native file picker only for export/import.

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

## Tech stack

- [Tauri 2](https://tauri.app/) + React + TypeScript + Vite + Tailwind CSS
- Local JSON storage (no account, no cloud)

## License

[MIT](LICENSE)
