/**
 * MCP server factory
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "./session-manager.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

/**
 * Create and configure the Feedback MCP server
 * Does not connect transport - that's the caller's responsibility
 */
export function createServer(sessionManager: SessionManager): McpServer {
  const server = new McpServer({
    name: "feedback",
    version: "0.1.0",
  });

  // Register MCP tools
  registerTools(server, sessionManager);

  // Register MCP resources
  registerResources(server, sessionManager);

  // Register MCP prompts
  registerPrompts(server);

  return server;
}
