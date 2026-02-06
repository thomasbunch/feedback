/**
 * MCP Tool 19: get_console_logs
 * Retrieves browser console logs captured during a session.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";

export function registerGetConsoleLogsTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_console_logs",
    "Get browser console logs captured during the session. Use to check for warnings, errors, or debug output from web apps.",
    {
      sessionId: z.string().describe("Session ID to get logs from"),
      level: z
        .enum(["all", "log", "error", "warning", "info", "debug"])
        .optional()
        .describe("Filter by log level (default: all)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Max entries to return, most recent first (default: 100)"),
    },
    async ({ sessionId, level, limit }) => {
      const session = sessionManager.get(sessionId);
      if (!session) {
        return createToolError(
          `Session not found: ${sessionId}`,
          "The session may have already been ended or never existed",
          "Create a session first with create_session."
        );
      }

      const collectors = sessionManager.getConsoleCollectors(sessionId);
      if (collectors.length === 0) {
        return createToolResult({
          count: 0,
          truncated: false,
          entries: [],
          note: "No console logs captured yet — ensure a page exists in this session",
        });
      }

      // Aggregate entries from all collectors
      let entries = collectors.flatMap((c) => [...c.getEntries()]);

      // Filter by level if specified
      if (level && level !== "all") {
        entries = entries.filter((entry) => entry.level === level);
      }

      // Sort by timestamp descending (newest first)
      entries.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Apply limit
      const maxEntries = limit ?? 100;
      const truncated = entries.length > maxEntries;
      const totalCount = entries.length;
      entries = entries.slice(0, maxEntries);

      return createToolResult({
        count: entries.length,
        totalAvailable: totalCount,
        truncated,
        entries,
      });
    }
  );
}
