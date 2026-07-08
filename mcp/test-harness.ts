/**
 * MCP Test Harness — speaks JSON-RPC over stdio to mcp/server.ts
 *
 * Usage:
 *   bun mcp/test-harness.ts list
 *   bun mcp/test-harness.ts call windrose_ping
 *   bun mcp/test-harness.ts call windrose_open_map '{"notePath":"scratch/HexMapScratch.md"}'
 */

import { spawn } from "node:child_process";
import * as readline from "node:readline";
import * as path from "node:path";

const [, , command, toolName, argsJson] = process.argv;

if (!command || (command !== "list" && command !== "call")) {
  console.error("Usage: bun mcp/test-harness.ts list");
  console.error("       bun mcp/test-harness.ts call <tool-name> ['{\"key\":\"value\"}']");
  process.exit(1);
}

const serverPath = path.resolve(import.meta.dirname || ".", "server.ts");

// Spawn the MCP server as a child process
const server = spawn("bun", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

// Pass through server stderr
server.stderr?.on("data", (data: Buffer) => {
  process.stderr.write(`[server] ${data}`);
});

server.on("error", (err) => {
  console.error("Failed to spawn server:", err.message);
  process.exit(1);
});

// Read newline-delimited JSON responses
const rl = readline.createInterface({ input: server.stdout! });
const pendingResponses = new Map<number, (msg: any) => void>();
let nextId = 1;

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: any;
  try { msg = JSON.parse(line); } catch {
    // Not JSON — ignore (server startup noise)
    return;
  }
  if (msg.id !== undefined && pendingResponses.has(msg.id)) {
    const resolve = pendingResponses.get(msg.id)!;
    pendingResponses.delete(msg.id);
    resolve(msg);
  }
});

function send(msg: object): Promise<any> {
  return new Promise((resolve) => {
    const id = (msg as any).id;
    if (id !== undefined) pendingResponses.set(id, resolve);
    server.stdin!.write(JSON.stringify(msg) + "\n");
    if (id === undefined) resolve(null);
  });
}

function rpc(method: string, params: object = {}): Promise<any> {
  const id = nextId++;
  return send({ jsonrpc: "2.0", id, method, params });
}

async function main() {
  // MCP handshake: initialize → initialized notification
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-harness", version: "0.1.0" },
  });
  // Send initialized notification (no id, no response expected)
  server.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // Small delay to let server settle
  await new Promise((r) => setTimeout(r, 100));

  if (command === "list") {
    const res = await rpc("tools/list", {});
    if (res.error) {
      console.error("Error:", JSON.stringify(res.error, null, 2));
    } else {
      const tools: any[] = res.result?.tools || [];
      console.log(`Tools (${tools.length}):`);
      for (const t of tools) {
        console.log(`  ${t.name}`);
      }
    }
  } else if (command === "call") {
    if (!toolName) {
      console.error("Error: tool name required for 'call'");
      server.stdin!.end();
      process.exit(1);
    }
    let args: Record<string, unknown> = {};
    if (argsJson) {
      try { args = JSON.parse(argsJson); } catch (e: any) {
        console.error("Error parsing args JSON:", e.message);
        server.stdin!.end();
        process.exit(1);
      }
    }
    const res = await rpc("tools/call", { name: toolName, arguments: args });
    if (res.error) {
      console.error("RPC error:", JSON.stringify(res.error, null, 2));
    } else {
      const content: any[] = res.result?.content || [];
      for (const item of content) {
        if (item.type === "text") {
          console.log(item.text);
        } else {
          console.log(JSON.stringify(item, null, 2));
        }
      }
      if (res.result?.isError) {
        process.exitCode = 1;
      }
    }
  }

  server.stdin!.end();
  // Give server a moment to flush before exit
  await new Promise((r) => setTimeout(r, 200));
  server.kill();
}

main().catch((err) => {
  console.error("Harness error:", err.message);
  server.kill();
  process.exit(1);
});
