/**
 * MCP Tool 22: get_process_output
 * Retrieves stdout/stderr output from spawned processes in a session.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";

export function registerGetProcessOutputTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_process_output",
    "Get stdout/stderr output from spawned processes in the session. Use to check dev server logs, build errors, or runtime output.",
    {
      sessionId: z.string().describe("Session ID to get output from"),
      stream: z
        .enum(["all", "stdout", "stderr"])
        .optional()
        .describe("Filter by output stream (default: all)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(5000)
        .optional()
        .describe("Max lines to return, most recent first (default: 200)"),
    },
    async ({ sessionId, stream, limit }) => {
      const session = sessionManager.get(sessionId);
      if (!session) {
        return createToolError(
          `Session not found: ${sessionId}`,
          "The session may have already been ended or never existed",
          "Create a session first with create_session."
        );
      }

      const collectors = sessionManager.getProcessCollectors(sessionId);
      if (collectors.length === 0) {
        return createToolResult({
          count: 0,
          truncated: false,
          entries: [],
          note: "No process output captured yet — ensure a process exists in this session",
        });
      }

      // Aggregate entries from all collectors
      let entries = collectors.flatMap((c) => [...c.getEntries()]);

      // Filter by stream if specified
      if (stream && stream !== "all") {
        entries = entries.filter((entry) => entry.stream === stream);
      }

      // Sort by timestamp descending (newest first)
      entries.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Apply limit
      const maxEntries = limit ?? 200;
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
