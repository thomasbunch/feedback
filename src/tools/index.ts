/**
 * MCP tool registration
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { registerCheckPortTool } from "./check-port.js";
import { registerLaunchWebServerTool } from "./launch-web-server.js";
import { registerLaunchElectronTool } from "./launch-electron.js";

/**
 * Register all MCP tools with the server
 */
export function registerTools(
  server: McpServer,
  sessionManager: SessionManager
): void {
  // Tool 1: get_version
  server.tool(
    "get_version",
    "Get server version and capabilities. Use to verify the server is running and responsive.",
    {},
    async () => {
      return createToolResult({
        name: "feedback",
        version: "0.1.0",
        status: "ready",
        capabilities: [
          "process_lifecycle",
          "screenshots",
          "interactions",
          "error_capture",
          "workflows",
        ],
      });
    }
  );

  // Tool 2: create_session
  server.tool(
    "create_session",
    "Create a new session for tracking app resources. Returns a unique session ID used by other tools.",
    {},
    async () => {
      const sessionId = sessionManager.create();
      return createToolResult({
        sessionId,
        created: true,
      });
    }
  );

  // Tool 3: list_sessions
  server.tool(
    "list_sessions",
    "List all active session IDs. Use to find existing sessions or check server state.",
    {},
    async () => {
      const sessions = sessionManager.list();
      return createToolResult({
        sessions,
        count: sessions.length,
      });
    }
  );

  // Tool 4: end_session
  server.tool(
    "end_session",
    "End a session and clean up all its resources. Use when done testing an application.",
    {
      sessionId: z.string().describe("The session ID to end"),
    },
    async ({ sessionId }) => {
      const session = sessionManager.get(sessionId);
      if (!session) {
        const availableSessions = sessionManager.list();
        return createToolError(
          `Session not found: ${sessionId}`,
          "The session may have already been ended or never existed",
          availableSessions.length > 0
            ? `Available sessions: ${availableSessions.join(", ")}`
            : "No active sessions. Create one with create_session first."
        );
      }

      await sessionManager.destroy(sessionId);
      return createToolResult({
        sessionId,
        ended: true,
      });
    }
  );

  // Tool 5: check_port
  registerCheckPortTool(server, sessionManager);

  // Tool 6: launch_web_server
  registerLaunchWebServerTool(server, sessionManager);

  // Tool 7: launch_electron
  registerLaunchElectronTool(server, sessionManager);

  console.error("Registered 7 MCP tools");
}
