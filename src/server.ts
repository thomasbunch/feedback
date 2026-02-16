/**
 * MCP server factory
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "./session-manager.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));

/**
 * Create and configure the Feedback MCP server
 * Does not connect transport - that's the caller's responsibility
 */
export function createServer(sessionManager: SessionManager): McpServer {
  const server = new McpServer({
    name: "feedback",
    version: pkg.version,
  });

  // Register MCP tools
  registerTools(server, sessionManager);

  // Register MCP resources
  registerResources(server, sessionManager);

  // Register MCP prompts
  registerPrompts(server);

  return server;
}
