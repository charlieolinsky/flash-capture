import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function cliPath() {
  return fileURLToPath(new URL("./flashcapture.mjs", import.meta.url));
}

export function skillSourcePath() {
  return path.resolve(path.dirname(cliPath()), "..", "skills", "flash-capture", "SKILL.md");
}

export function mcpCommand(absCli = cliPath()) {
  return { command: "node", args: [absCli, "mcp"] };
}

export function mergeJsonMcp(existing, { key, entry }) {
  const doc = existing && typeof existing === "object" ? { ...existing } : {};
  const bucket = doc[key] && typeof doc[key] === "object" ? { ...doc[key] } : {};
  bucket.flashcapture = entry;
  doc[key] = bucket;
  return doc;
}

export function mergeGrokToml(raw, absCli) {
  const block = [
    "[mcp_servers.flashcapture]",
    'command = "node"',
    "args = [",
    `    ${JSON.stringify(absCli)},`,
    '    "mcp",',
    "]",
    "enabled = true",
    "",
  ].join("\n");

  const text = raw || "";
  const re = /\[mcp_servers\.flashcapture\][\s\S]*?(?=\n\[|\n*$)/;
  if (re.test(text)) {
    return text.replace(re, block.trimEnd());
  }
  const trimmed = text.replace(/\s*$/, "");
  return `${trimmed}${trimmed ? "\n\n" : ""}${block}`;
}

function writeFile(filePath, contents, { dryRun, created }) {
  if (dryRun) {
    created.push({ path: filePath, dryRun: true, bytes: contents.length });
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  created.push({ path: filePath, dryRun: false, bytes: contents.length });
}

function copySkill(destDir, { dryRun, created }) {
  const src = skillSourcePath();
  const dest = path.join(destDir, "flash-capture", "SKILL.md");
  const body = fs.readFileSync(src, "utf8");
  writeFile(dest, body, { dryRun, created });
}

function mergeJsonFile(filePath, key, entry, extra = {}, { dryRun, created }) {
  let existing = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      throw new Error(`Could not parse ${filePath}: ${err instanceof Error ? err.message : err}`);
    }
  }
  const next = { ...extra, ...mergeJsonMcp(existing, { key, entry }) };
  writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, { dryRun, created });
}

export function installAgents({ dryRun = false, home = os.homedir() } = {}) {
  const absCli = cliPath();
  const created = [];
  const notes = [];
  const { command, args } = mcpCommand(absCli);
  const stdioEntry = { command, args };
  const vscodeEntry = { type: "stdio", command, args };

  const grokToml = path.join(home, ".grok", "config.toml");
  const grokRaw = fs.existsSync(grokToml) ? fs.readFileSync(grokToml, "utf8") : "";
  writeFile(grokToml, mergeGrokToml(grokRaw, absCli), { dryRun, created });
  copySkill(path.join(home, ".grok", "skills"), { dryRun, created });

  const claudeSkillDir = path.join(home, ".claude", "skills");
  copySkill(claudeSkillDir, { dryRun, created });
  const claude = spawnSync("claude", ["mcp", "add", "--scope", "user", "--transport", "stdio", "flashcapture", "--", "node", absCli, "mcp"], {
    encoding: "utf8",
  });
  if (claude.error || claude.status !== 0) {
    notes.push(
      `Claude Code CLI not updated (${claude.error?.message || claude.stderr || "claude not on PATH"}). Run: claude mcp add --scope user --transport stdio flashcapture -- node ${absCli} mcp`,
    );
  } else {
    notes.push("Claude Code user MCP registered via `claude mcp add`.");
  }

  mergeJsonFile(path.join(home, ".cursor", "mcp.json"), "mcpServers", stdioEntry, {}, { dryRun, created });

  const vscodeUser =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support", "Code", "User", "mcp.json")
      : process.platform === "win32"
        ? path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Code", "User", "mcp.json")
        : path.join(home, ".config", "Code", "User", "mcp.json");
  mergeJsonFile(vscodeUser, "servers", vscodeEntry, {}, { dryRun, created });

  mergeJsonFile(path.join(home, ".copilot", "mcp-config.json"), "mcpServers", { type: "local", command, args, tools: ["*"] }, {}, {
    dryRun,
    created,
  });

  return { cli: absCli, created, notes };
}
