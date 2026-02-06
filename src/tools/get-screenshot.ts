/**
 * get_screenshot MCP tool
 * Retrieves the most recent auto-captured screenshot for a session
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";

export function registerGetScreenshotTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_screenshot",
    "Get the most recent auto-captured screenshot for a session. Use to check current visual state without triggering a new capture.",
    {
      sessionId: z.string().describe("Session ID to get the screenshot for"),
    },
    async ({ sessionId }) => {
      try {
        const session = sessionManager.get(sessionId);
        if (!session) {
          return createToolError(
            `Session not found: ${sessionId}`,
            "The session may have already been ended",
            "Create a session first with create_session."
          );
        }

        const autoCapture = sessionManager.getAutoCapture(sessionId);
        if (!autoCapture) {
          return createToolError(
            "No auto-captured screenshot available",
            `Session ${sessionId} has no auto-capture yet. Auto-captures are taken after page navigations in web and Electron apps.`,
            "Use screenshot_web, screenshot_electron, or screenshot_desktop for an on-demand capture. Or navigate the app to trigger an auto-capture."
          );
        }

        return createScreenshotResult(
          {
            sessionId,
            source: "auto-capture",
            url: autoCapture.url,
            capturedAt: autoCapture.capturedAt.toISOString(),
          },
          autoCapture.imageBase64,
          autoCapture.mimeType
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createToolError(
          "Failed to retrieve screenshot",
          message,
          "Check the session ID is valid."
        );
      }
    }
  );
}
