/**
 * MCP server factory
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "./session-manager.js";
import { registerTools } from "./tools/index.js";

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

  return server;
}
