/**
 * MCP Tool 21: get_network_logs
 * Retrieves HTTP request/response logs captured during a session.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";

export function registerGetNetworkLogsTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_network_logs",
    "Get HTTP request/response logs captured during the session. Use to inspect API calls, failed requests, or slow responses in web apps.",
    {
      sessionId: z.string().describe("Session ID to get network logs from"),
      filter: z
        .enum(["all", "failed", "errors"])
        .optional()
        .describe(
          "Filter: 'failed' = status 0 (network errors), 'errors' = status >= 400 or 0 (default: all)"
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Max entries to return, most recent first (default: 100)"),
    },
    async ({ sessionId, filter, limit }) => {
      const session = sessionManager.get(sessionId);
      if (!session) {
        return createToolError(
          `Session not found: ${sessionId}`,
          "The session may have already been ended or never existed",
          "Create a session first with create_session."
        );
      }

      const collectors = sessionManager.getNetworkCollectors(sessionId);
      if (collectors.length === 0) {
        return createToolResult({
          count: 0,
          truncated: false,
          entries: [],
          note: "No network logs captured yet — ensure a page exists in this session",
        });
      }

      // Aggregate entries from all collectors
      let entries = collectors.flatMap((c) => [...c.getEntries()]);

      // Apply filter
      if (filter === "failed") {
        entries = entries.filter((entry) => entry.status === 0);
      } else if (filter === "errors") {
        entries = entries.filter(
          (entry) => entry.status === 0 || entry.status >= 400
        );
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
