#!/usr/bin/env node
/**
 * FlashCapture CLI + MCP server.
 * Reads and writes the same cards.json the desktop app uses.
 *
 *   node cli/flashcapture.mjs --help
 *   node cli/flashcapture.mjs cards add -q "Question" -a "Answer"
 *   node cli/flashcapture.mjs mcp
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as lib from "./lib.mjs";

const VERSION = "0.1.0";

const HELP = `FlashCapture ${VERSION} — manage local flashcards from the CLI or MCP.

Usage:
  flashcapture [--data-dir <path>] [--json] <command> [args]

Library commands:
  data-dir                         Print the cards.json directory
  decks list
  decks add <name>
  decks rename <id-or-name> <name>
  decks delete <id-or-name>
  cards list [--deck <id-or-name>] [--tag <tag>] [--search <q>] [--limit <n>]
  cards add --question <q> --answer <a> [--deck <id-or-name>] [--tags t1,t2]
  cards get <id>
  cards update <id> [--question q] [--answer a] [--deck d] [--tags t1,t2]
  cards delete <id>
  export [path]
  import <path> [--replace]

Shortcuts:
  add     same as cards add
  list    same as cards list

Agent:
  mcp     Start an MCP server on stdio (same operations as tools)

Global flags:
  --data-dir, -D <path>   Override FLASHCAPTURE_DATA_DIR
  --json                  Machine-readable JSON output
  -h, --help              Show this help
  -V, --version           Print version

Environment:
  FLASHCAPTURE_DATA_DIR   Default library directory (shared with the desktop app)

Examples:
  flashcapture cards add -q "What is Tauri?" -a "A toolkit for native webview apps" --deck General --tags rust
  flashcapture cards list --search tauri
`;

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const flags = { json: false, dataDir: undefined, replace: false };
  const positionals = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case "-h":
      case "--help":
        flags.help = true;
        break;
      case "-V":
      case "--version":
        flags.version = true;
        break;
      case "--json":
        flags.json = true;
        break;
      case "--replace":
        flags.replace = true;
        break;
      case "-D":
      case "--data-dir":
        flags.dataDir = next();
        break;
      case "-q":
      case "--question":
        opts.question = next();
        break;
      case "-a":
      case "--answer":
        opts.answer = next();
        break;
      case "--deck":
        opts.deck = next();
        break;
      case "--tags":
        opts.tags = next();
        break;
      case "--tag":
        opts.tag = next();
        break;
      case "--search":
        opts.search = next();
        break;
      case "--limit":
        opts.limit = next();
        break;
      default:
        if (arg.startsWith("-")) fail(`Unknown flag: ${arg}`);
        positionals.push(arg);
    }
  }
  return { flags, opts, positionals };
}

function print(value, asJson) {
  if (asJson || (value && typeof value === "object")) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${value}\n`);
}

function formatCard(card) {
  const tags = card.tags?.length ? ` [${card.tags.join(", ")}]` : "";
  return `${card.id}  (${card.deckName})${tags}\n  Q: ${oneLine(card.question)}\n  A: ${oneLine(card.answer)}`;
}

function oneLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function runCli(argv) {
  const { flags, opts, positionals } = parseArgs(argv);
  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (flags.help || positionals.length === 0) {
    process.stdout.write(HELP);
    return;
  }

  if (flags.dataDir) {
    process.env.FLASHCAPTURE_DATA_DIR = flags.dataDir;
  }
  const dataDir = lib.defaultDataDir();

  let [group, action, ...rest] = positionals;
  if (group === "add") {
    rest = action ? [action, ...rest] : rest;
    group = "cards";
    action = "add";
  } else if (group === "list") {
    rest = action ? [action, ...rest] : rest;
    group = "cards";
    action = "list";
  } else if (group === "mcp") {
    return runMcp();
  } else if (group === "export") {
    rest = action ? [action, ...rest] : rest;
    action = "";
  } else if (group === "import") {
    rest = action ? [action, ...rest] : rest;
    action = "";
  } else if (group === "data-dir") {
    action = "";
  }

  const json = flags.json;
  const command = `${group} ${action || ""}`.trim();

  try {
    switch (command) {
      case "data-dir":
        print(dataDir, json);
        return;
      case "decks list": {
        const decks = lib.listDecks(dataDir);
        if (json) print(decks, true);
        else {
          for (const d of decks) process.stdout.write(`${d.id}  ${d.name}\n`);
        }
        return;
      }
      case "decks add": {
        const name = rest.join(" ").trim();
        if (!name) fail("Usage: flashcapture decks add <name>");
        print(lib.upsertDeck({ name }, dataDir), true);
        return;
      }
      case "decks rename": {
        const [idOrName, ...nameParts] = rest;
        const name = nameParts.join(" ").trim();
        if (!idOrName || !name) fail("Usage: flashcapture decks rename <id-or-name> <name>");
        const deck = lib.findDeck(lib.loadStore(dataDir), idOrName);
        if (!deck) fail(`Deck not found: ${idOrName}`);
        print(lib.upsertDeck({ id: deck.id, name }, dataDir), true);
        return;
      }
      case "decks delete": {
        const idOrName = rest.join(" ").trim();
        if (!idOrName) fail("Usage: flashcapture decks delete <id-or-name>");
        print(lib.deleteDeck(idOrName, dataDir), true);
        return;
      }
      case "cards list": {
        const cards = lib.listCards(
          { deck: opts.deck, tag: opts.tag, search: opts.search, limit: opts.limit },
          dataDir,
        );
        if (json) print(cards, true);
        else if (cards.length === 0) process.stdout.write("No cards.\n");
        else process.stdout.write(cards.map(formatCard).join("\n\n") + "\n");
        return;
      }
      case "cards add": {
        if (!opts.question || !opts.answer) {
          fail("Usage: flashcapture cards add -q <question> -a <answer> [--deck name] [--tags a,b]");
        }
        print(
          lib.upsertCard(
            { question: opts.question, answer: opts.answer, deck: opts.deck, tags: opts.tags },
            dataDir,
          ),
          true,
        );
        return;
      }
      case "cards get": {
        const id = rest[0];
        if (!id) fail("Usage: flashcapture cards get <id>");
        print(lib.getCard(id, dataDir), true);
        return;
      }
      case "cards update": {
        const id = rest[0];
        if (!id) fail("Usage: flashcapture cards update <id> [--question q] [--answer a] [--deck d] [--tags t]");
        print(
          lib.upsertCard(
            {
              id,
              question: opts.question,
              answer: opts.answer,
              deck: opts.deck,
              tags: opts.tags,
            },
            dataDir,
          ),
          true,
        );
        return;
      }
      case "cards delete": {
        const id = rest[0];
        if (!id) fail("Usage: flashcapture cards delete <id>");
        lib.deleteCard(id, dataDir);
        print({ ok: true, id }, true);
        return;
      }
      case "export": {
        const out = rest[0];
        const store = lib.exportStore(out, dataDir);
        if (out) print({ ok: true, path: path.resolve(out) }, true);
        else print(store, true);
        return;
      }
      case "import": {
        const filePath = rest[0];
        if (!filePath) fail("Usage: flashcapture import <path> [--replace]");
        const store = lib.importStoreFromPath(filePath, { replace: flags.replace }, dataDir);
        print({ ok: true, decks: store.decks.length, cards: store.cards.length }, true);
        return;
      }
      default:
        fail(`Unknown command: ${positionals.join(" ")}\n\nRun flashcapture --help`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

const TOOLS = [
  {
    name: "list_decks",
    description: "List FlashCapture decks in the local library.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "add_deck",
    description: "Create a new deck.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Deck name" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "rename_deck",
    description: "Rename a deck by id or exact name.",
    inputSchema: {
      type: "object",
      properties: {
        deck: { type: "string", description: "Deck id or name" },
        name: { type: "string", description: "New name" },
      },
      required: ["deck", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_deck",
    description: "Delete a deck. Cards move to another remaining deck.",
    inputSchema: {
      type: "object",
      properties: { deck: { type: "string", description: "Deck id or name" } },
      required: ["deck"],
      additionalProperties: false,
    },
  },
  {
    name: "list_cards",
    description: "List or search flashcards. Returns id, deck, question, answer, tags, and stats.",
    inputSchema: {
      type: "object",
      properties: {
        deck: { type: "string", description: "Filter by deck id or name" },
        tag: { type: "string", description: "Filter by exact tag" },
        search: { type: "string", description: "Case-insensitive substring over question, answer, tags" },
        limit: { type: "number", description: "Max cards to return" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_card",
    description: "Fetch one card by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "add_card",
    description:
      "Add a flashcard to the local FlashCapture library. Question and answer are required. Deck defaults to last-used / default / General.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        answer: { type: "string" },
        deck: { type: "string", description: "Deck id or name" },
        tags: {
          description: "Tags as an array or comma-separated string",
          anyOf: [{ type: "array", items: { type: "string" } }, { type: "string" }],
        },
      },
      required: ["question", "answer"],
      additionalProperties: false,
    },
  },
  {
    name: "update_card",
    description: "Update fields on an existing card.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        question: { type: "string" },
        answer: { type: "string" },
        deck: { type: "string" },
        tags: {
          anyOf: [{ type: "array", items: { type: "string" } }, { type: "string" }],
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_card",
    description: "Delete a card by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "library_info",
    description: "Show the data directory and how many decks/cards are stored.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function callTool(name, args = {}) {
  const dataDir = lib.defaultDataDir();
  switch (name) {
    case "list_decks":
      return lib.listDecks(dataDir);
    case "add_deck":
      return lib.upsertDeck({ name: args.name }, dataDir);
    case "rename_deck": {
      const deck = lib.findDeck(lib.loadStore(dataDir), args.deck);
      if (!deck) throw new Error(`Deck not found: ${args.deck}`);
      return lib.upsertDeck({ id: deck.id, name: args.name }, dataDir);
    }
    case "delete_deck":
      return lib.deleteDeck(args.deck, dataDir);
    case "list_cards":
      return lib.listCards(
        { deck: args.deck, tag: args.tag, search: args.search, limit: args.limit },
        dataDir,
      );
    case "get_card":
      return lib.getCard(args.id, dataDir);
    case "add_card":
      return lib.upsertCard(
        { question: args.question, answer: args.answer, deck: args.deck, tags: args.tags },
        dataDir,
      );
    case "update_card":
      return lib.upsertCard(
        {
          id: args.id,
          question: args.question,
          answer: args.answer,
          deck: args.deck,
          tags: args.tags,
        },
        dataDir,
      );
    case "delete_card":
      lib.deleteCard(args.id, dataDir);
      return { ok: true, id: args.id };
    case "library_info":
      return lib.summarizeStore(dataDir);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

let rpcFraming = "ndjson";

function writeRpc(message) {
  const json = JSON.stringify(message);
  // Grok uses newline-delimited JSON; Claude Desktop and the TS SDK use Content-Length.
  // Reply in whatever framing the last request used.
  const payload =
    rpcFraming === "content-length"
      ? Buffer.from(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`, "utf8")
      : Buffer.from(`${json}\n`, "utf8");
  fs.writeSync(1, payload);
}

function okResult(id, result) {
  writeRpc({ jsonrpc: "2.0", id, result });
}

function errResult(id, code, message) {
  writeRpc({ jsonrpc: "2.0", id, error: { code, message } });
}

function handleRpc(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize": {
        const protocolVersion = params?.protocolVersion || "2024-11-05";
        okResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "flashcapture", version: VERSION },
        });
        return;
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        return;
      case "ping":
        if (!isNotification) okResult(id, {});
        return;
      case "tools/list":
        okResult(id, { tools: TOOLS });
        return;
      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments || {};
        try {
          const result = callTool(name, args);
          okResult(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          });
        } catch (err) {
          const text = err instanceof Error ? err.message : String(err);
          okResult(id, {
            content: [{ type: "text", text }],
            isError: true,
          });
        }
        return;
      }
      default:
        if (!isNotification) errResult(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (!isNotification) {
      errResult(id, -32603, err instanceof Error ? err.message : String(err));
    }
  }
}

async function runMcp() {
  process.stdin.resume();
  let buf = Buffer.alloc(0);
  const processBuffer = () => {
    while (true) {
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const header = buf.subarray(0, headerEnd).toString("utf8");
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buf = buf.subarray(headerEnd + 4);
          continue;
        }
        const len = Number(match[1]);
        const start = headerEnd + 4;
        if (buf.length < start + len) return;
        const body = buf.subarray(start, start + len).toString("utf8");
        buf = buf.subarray(start + len);
        rpcFraming = "content-length";
        handleRpc(JSON.parse(body));
        continue;
      }

      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      // Only treat as NDJSON when it looks like a JSON object (no Content-Length yet).
      const line = buf.subarray(0, nl).toString("utf8").trim();
      buf = buf.subarray(nl + 1);
      if (!line || line.startsWith("Content-Length:")) continue;
      if (line.startsWith("{")) {
        rpcFraming = "ndjson";
        handleRpc(JSON.parse(line));
      }
    }
  };

  process.stdin.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    try {
      processBuffer();
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cmd = process.argv[2];
  if (cmd === "mcp" && !process.argv.includes("--help")) {
    if (process.argv.includes("--data-dir") || process.argv.includes("-D")) {
      const { flags } = parseArgs(process.argv.slice(2));
      if (flags.dataDir) process.env.FLASHCAPTURE_DATA_DIR = flags.dataDir;
    }
    runMcp();
  } else {
    runCli(process.argv.slice(2));
  }
}

export { runCli, callTool, TOOLS };
