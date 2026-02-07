/**
 * In-memory MCP test client factory
 * Creates a real MCP server + client connected via in-memory transport
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "../../src/server.js";
import { SessionManager } from "../../src/session-manager.js";

export interface TestContext {
  client: Client;
  server: McpServer;
  sessionManager: SessionManager;
  cleanup: () => Promise<void>;
}

/**
 * Create an in-memory MCP client connected to the real server.
 * Returns a TestContext with client, server, sessionManager, and cleanup function.
 */
export async function createTestClient(): Promise<TestContext> {
  const sessionManager = new SessionManager();
  const server = createServer(sessionManager);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.1.0" });
  await client.connect(clientTransport);

  const cleanup = async () => {
    try {
      await client.close();
    } catch {
      // Client may already be closed
    }
    try {
      await server.close();
    } catch {
      // Server may already be closed
    }
  };

  return { client, server, sessionManager, cleanup };
}
