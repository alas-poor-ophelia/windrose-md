/**
 * Windrose MCP Server
 *
 * Provides programmatic control of a running Windrose map editor instance
 * inside Obsidian. Communicates via the Obsidian CLI (eval, screenshot, etc).
 *
 * Usage:
 *   bun run mcp/server.ts        (stdio transport for Claude Code)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerQueryTools } from "./tools/query-tools.js";
import { registerNavTools } from "./tools/nav-tools.js";
import { registerStateTools } from "./tools/state-tools.js";
import { registerDrawTools } from "./tools/draw-tools.js";
import { registerVisionTools } from "./tools/vision-tools.js";
import { registerInteractTools } from "./tools/interact-tools.js";

const server = new McpServer({
  name: "windrose",
  version: "0.2.0",
});

// Register tool groups
registerQueryTools(server);
registerNavTools(server);
registerStateTools(server);
registerDrawTools(server);
registerVisionTools(server);
registerInteractTools(server);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
