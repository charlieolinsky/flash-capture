import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./flashcapture.mjs", import.meta.url));

function send(child, message) {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, "utf8");
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}

function readMessages(child, count, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const messages = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${count} MCP messages`));
    }, timeoutMs);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const headerEnd = buf.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const header = buf.subarray(0, headerEnd).toString("utf8");
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buf = buf.subarray(headerEnd + 4);
          continue;
        }
        const len = Number(match[1]);
        const start = headerEnd + 4;
        if (buf.length < start + len) break;
        const body = buf.subarray(start, start + len).toString("utf8");
        buf = buf.subarray(start + len);
        messages.push(JSON.parse(body));
        if (messages.length >= count) {
          cleanup();
          resolve(messages);
          return;
        }
      }
    };
    const onErr = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("error", onErr);
    };
    child.stdout.on("data", onData);
    child.on("error", onErr);
  });
}

test("MCP initialize, list tools, and add_card", async () => {
  const dir = path.join(os.tmpdir(), `flashcapture-mcp-${randomUUID()}`);
  const child = spawn(process.execPath, [cli, "mcp", "--data-dir", dir], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    send(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
    send(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    send(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "add_card",
        arguments: { question: "MCP Q", answer: "MCP A", tags: ["mcp"] },
      },
    });
    const messages = await readMessages(child, 3);
    const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
    assert.equal(byId[1].result.serverInfo.name, "flashcapture");
    assert.ok(byId[2].result.tools.some((t) => t.name === "add_card"));
    const added = JSON.parse(byId[3].result.content[0].text);
    assert.equal(added.question, "MCP Q");
    assert.equal(added.answer, "MCP A");
  } finally {
    child.kill("SIGTERM");
  }
});

test("MCP accepts newline-delimited JSON (Grok framing)", async () => {
  const dir = path.join(os.tmpdir(), `flashcapture-mcp-ndjson-${randomUUID()}`);
  const child = spawn(process.execPath, [cli, "mcp", "--data-dir", dir], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      })}\n`,
    );
    const line = await new Promise((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => reject(new Error("NDJSON initialize timed out")), 4000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buf += chunk;
        const nl = buf.indexOf("\n");
        if (nl !== -1) {
          clearTimeout(timer);
          resolve(buf.slice(0, nl));
        }
      });
      child.on("error", reject);
    });
    const msg = JSON.parse(line);
    assert.equal(msg.id, 1);
    assert.equal(msg.result.serverInfo.name, "flashcapture");
    assert.equal(msg.result.protocolVersion, "2025-11-25");
  } finally {
    child.kill("SIGTERM");
  }
});
