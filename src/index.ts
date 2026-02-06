#!/usr/bin/env node

/**
 * Entry point for Feedback MCP server
 * Starts server on stdio transport with graceful shutdown handling
 */

import { createServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ShutdownManager } from "./utils/shutdown.js";
import { SessionManager } from "./session-manager.js";

// Create shutdown manager before any async operations
const shutdownManager = new ShutdownManager();

// Create session manager
const sessionManager = new SessionManager();

// Register signal handlers BEFORE connecting transport
process.once("SIGINT", () => {
  void shutdownManager.cleanup();
});

process.once("SIGTERM", () => {
  void shutdownManager.cleanup();
});

async function main(): Promise<void> {
  // Create server with session manager
  const server = createServer(sessionManager);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Register cleanup handlers
  shutdownManager.register(async () => {
    console.error("Closing server");
  });

  shutdownManager.register(async () => {
    await sessionManager.destroyAll();
  });

  console.error("Feedback MCP Server running on stdio");
}

// Start server with fatal error handler
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
