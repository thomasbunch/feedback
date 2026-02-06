/**
 * stop_process MCP tool (PROC-05)
 * Stops all processes in a session by destroying the session and its resources
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";

/**
 * Register the stop_process tool with the MCP server
 *
 * Destroys a session, which triggers cleanup of all registered resources
 * (process trees, Electron apps, etc.). This is intentionally session-wide
 * because each session typically manages one application under test.
 */
export function registerStopProcessTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "stop_process",
    "Stop all processes in a session and clean up resources. Use to terminate running apps when done or to free ports.",
    {
      sessionId: z.string().describe("Session ID whose processes to stop"),
    },
    async ({ sessionId }) => {
      try {
        // Validate session exists
        const session = sessionManager.get(sessionId);
        if (!session) {
          const availableSessions = sessionManager.list();
          return createToolError(
            `Session not found: ${sessionId}`,
            "The session may have already been ended or never existed",
            availableSessions.length > 0
              ? `Available sessions: ${availableSessions.join(", ")}`
              : "No active sessions. Use list_sessions to check."
          );
        }

        console.error(
          `[stop_process] Stopping all processes in session ${sessionId}`
        );

        // Destroy session -- triggers cleanup of all registered resources
        await sessionManager.destroy(sessionId);

        return createToolResult({
          sessionId,
          stopped: true,
          message:
            "All processes in session stopped and resources cleaned up",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Failed to stop processes",
          message,
          "The session may be in an inconsistent state. Try end_session or create a new session."
        );
      }
    }
  );
}
