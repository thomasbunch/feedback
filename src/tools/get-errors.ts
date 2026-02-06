/**
 * MCP Tool 20: get_errors
 * Retrieves runtime errors and page crashes captured during a session.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";

export function registerGetErrorsTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_errors",
    "Get runtime errors and page crashes captured during the session. Use to diagnose uncaught exceptions or page crashes in web apps.",
    {
      sessionId: z.string().describe("Session ID to get errors from"),
      type: z
        .enum(["all", "uncaught-exception", "page-crash"])
        .optional()
        .describe("Filter by error type (default: all)"),
    },
    async ({ sessionId, type }) => {
      const session = sessionManager.get(sessionId);
      if (!session) {
        return createToolError(
          `Session not found: ${sessionId}`,
          "The session may have already been ended or never existed",
          "Create a session first with create_session."
        );
      }

      const collectors = sessionManager.getErrorCollectors(sessionId);
      if (collectors.length === 0) {
        return createToolResult({
          count: 0,
          entries: [],
          note: "No errors captured yet — ensure a page exists in this session",
        });
      }

      // Aggregate entries from all collectors
      let entries = collectors.flatMap((c) => [...c.getEntries()]);

      // Filter by type if specified
      if (type && type !== "all") {
        entries = entries.filter((entry) => entry.type === type);
      }

      // Sort by timestamp descending (newest first)
      entries.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return createToolResult({
        count: entries.length,
        entries,
      });
    }
  );
}
