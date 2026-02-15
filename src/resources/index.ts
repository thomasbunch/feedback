/**
 * MCP resource registration
 * Exposes session-scoped data as MCP Resources using the feedback:// URI scheme
 */

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";

/**
 * Register all MCP resources with the server.
 * Provides 6 resources (1 static + 5 template-based) for session data.
 */
export function registerResources(
  server: McpServer,
  sessionManager: SessionManager
): void {
  // Resource 1: Static resource listing all active sessions
  server.resource(
    "active-sessions",
    "feedback://sessions",
    {
      description: "List of all active feedback sessions with metadata",
      mimeType: "application/json",
    },
    async (uri) => {
      const sessions = sessionManager.list().map((id) => {
        const session = sessionManager.get(id);
        return {
          id,
          createdAt: session?.createdAt.toISOString(),
          resourceCount: session?.resources.length ?? 0,
        };
      });
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(sessions, null, 2),
          },
        ],
      };
    }
  );

  // Resource 2: Template resource for console logs per session
  server.resource(
    "session-console-logs",
    new ResourceTemplate("feedback://sessions/{sessionId}/console-logs", {
      list: async () => ({
        resources: sessionManager.list().map((id) => ({
          uri: `feedback://sessions/${id}/console-logs`,
          name: `Console logs (${id.slice(0, 8)})`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description: "Console log entries captured for a session",
      mimeType: "application/json",
    },
    async (uri, { sessionId }) => {
      const sid = sessionId as string;
      const entries = sessionManager
        .getConsoleCollectors(sid)
        .flatMap((c) => c.getEntries());
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(entries, null, 2),
          },
        ],
      };
    }
  );

  // Resource 3: Template resource for errors per session
  server.resource(
    "session-errors",
    new ResourceTemplate("feedback://sessions/{sessionId}/errors", {
      list: async () => ({
        resources: sessionManager.list().map((id) => ({
          uri: `feedback://sessions/${id}/errors`,
          name: `Errors (${id.slice(0, 8)})`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description: "Error entries captured for a session",
      mimeType: "application/json",
    },
    async (uri, { sessionId }) => {
      const sid = sessionId as string;
      const entries = sessionManager
        .getErrorCollectors(sid)
        .flatMap((c) => c.getEntries());
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(entries, null, 2),
          },
        ],
      };
    }
  );

  // Resource 4: Template resource for network logs per session
  server.resource(
    "session-network-logs",
    new ResourceTemplate("feedback://sessions/{sessionId}/network-logs", {
      list: async () => ({
        resources: sessionManager.list().map((id) => ({
          uri: `feedback://sessions/${id}/network-logs`,
          name: `Network logs (${id.slice(0, 8)})`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description: "Network log entries captured for a session",
      mimeType: "application/json",
    },
    async (uri, { sessionId }) => {
      const sid = sessionId as string;
      const entries = sessionManager
        .getNetworkCollectors(sid)
        .flatMap((c) => c.getEntries());
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(entries, null, 2),
          },
        ],
      };
    }
  );

  // Resource 5: Template resource for latest screenshot per session (binary blob)
  server.resource(
    "session-screenshot",
    new ResourceTemplate("feedback://sessions/{sessionId}/screenshot", {
      list: async () => {
        const resources = [];
        for (const id of sessionManager.list()) {
          const capture = sessionManager.getAutoCapture(id);
          if (capture) {
            resources.push({
              uri: `feedback://sessions/${id}/screenshot`,
              name: `Latest screenshot (${id.slice(0, 8)})`,
              mimeType: capture.mimeType,
            });
          }
        }
        return { resources };
      },
    }),
    {
      description: "Latest auto-captured screenshot for a session",
      mimeType: "image/webp",
    },
    async (uri, { sessionId }) => {
      const sid = sessionId as string;
      const capture = sessionManager.getAutoCapture(sid);
      if (!capture) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "text/plain",
              text: "No screenshot available",
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: capture.mimeType,
            blob: capture.imageBase64,
          },
        ],
      };
    }
  );

  // Resource 6: Template resource for session state metadata
  server.resource(
    "session-state",
    new ResourceTemplate("feedback://sessions/{sessionId}/state", {
      list: async () => ({
        resources: sessionManager.list().map((id) => ({
          uri: `feedback://sessions/${id}/state`,
          name: `Session state (${id.slice(0, 8)})`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description: "Session state metadata including collectors summary",
      mimeType: "application/json",
    },
    async (uri, { sessionId }) => {
      const sid = sessionId as string;
      const session = sessionManager.get(sid);

      // Get page reference identifiers
      const pageRefs = sessionManager.getPageRefs(sid);
      const pageRefIdentifiers = pageRefs.map((ref) => ref.url ?? "unknown");

      // Collector entry counts
      const consoleEntryCount = sessionManager
        .getConsoleCollectors(sid)
        .reduce((sum, c) => sum + c.getEntries().length, 0);
      const errorEntryCount = sessionManager
        .getErrorCollectors(sid)
        .reduce((sum, c) => sum + c.getEntries().length, 0);
      const networkEntryCount = sessionManager
        .getNetworkCollectors(sid)
        .reduce((sum, c) => sum + c.getEntries().length, 0);

      const state = {
        id: sid,
        createdAt: session?.createdAt.toISOString() ?? null,
        resourceCount: session?.resources.length ?? 0,
        pageRefs: pageRefIdentifiers,
        hasAutoCapture: !!sessionManager.getAutoCapture(sid),
        collectors: {
          console: consoleEntryCount,
          error: errorEntryCount,
          network: networkEntryCount,
        },
      };

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    }
  );

  console.error("Registered 6 MCP resources");
}
