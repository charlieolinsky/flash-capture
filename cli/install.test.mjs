import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mergeGrokToml, mergeJsonMcp, installAgents } from "./install.mjs";

test("mergeGrokToml inserts or replaces the flashcapture server", () => {
  const inserted = mergeGrokToml("", "/tmp/cli.mjs");
  assert.match(inserted, /\[mcp_servers\.flashcapture\]/);
  assert.match(inserted, /\/tmp\/cli\.mjs/);
  const other = 'model = "grok"\n\n[mcp_servers.other]\ncommand = "x"\n';
  const merged = mergeGrokToml(other, "/abs/flashcapture.mjs");
  assert.match(merged, /mcp_servers\.other/);
  assert.match(merged, /\/abs\/flashcapture\.mjs/);
  const replaced = mergeGrokToml(merged, "/new/path.mjs");
  assert.match(replaced, /\/new\/path\.mjs/);
  assert.equal((replaced.match(/\[mcp_servers\.flashcapture\]/g) || []).length, 1);
});

test("mergeJsonMcp keeps sibling servers", () => {
  const next = mergeJsonMcp(
    { mcpServers: { github: { command: "npx" } } },
    { key: "mcpServers", entry: { command: "node", args: ["/c", "mcp"] } },
  );
  assert.equal(next.mcpServers.github.command, "npx");
  assert.deepEqual(next.mcpServers.flashcapture.args, ["/c", "mcp"]);
});

test("installAgents dry-run does not write", () => {
  const home = path.join(os.tmpdir(), `fc-install-${randomUUID()}`);
  fs.mkdirSync(home);
  const result = installAgents({ dryRun: true, home });
  assert.ok(result.created.length > 0);
  assert.ok(result.created.every((c) => c.dryRun));
  assert.equal(fs.existsSync(path.join(home, ".grok", "config.toml")), false);
});
