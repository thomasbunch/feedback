/**
 * MCP server factory
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Create and configure the Feedback MCP server
 * Does not connect transport - that's the caller's responsibility
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "feedback",
    version: "0.1.0",
  });

  // Tools will be registered in Phase 2

  return server;
}
