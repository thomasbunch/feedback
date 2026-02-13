/**
 * handle_dialog MCP tool
 * Pre-registers a one-shot handler for the next browser dialog (alert, confirm, prompt)
 */

import { z } from "zod";
import type { Dialog } from "playwright";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { getActivePage } from "../interaction/selectors.js";

/**
 * Register the handle_dialog tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerHandleDialogTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "handle_dialog",
    "Pre-register a handler for the next browser dialog (alert, confirm, prompt). Call this BEFORE the action that triggers the dialog (e.g., click_element). The handler fires once automatically when the dialog appears, then removes itself.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      action: z
        .enum(["accept", "dismiss"])
        .describe(
          "How to handle the dialog: 'accept' clicks OK/Yes, 'dismiss' clicks Cancel/No"
        ),
      promptText: z
        .string()
        .optional()
        .describe(
          "Text to enter in prompt dialogs before accepting. Only used with action: 'accept' on prompt dialogs."
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL or 'electron' to target a specific page. Omit if session has only one page."
        ),
    },
    async ({ sessionId, action, promptText, pageIdentifier }) => {
      try {
        // Validate session exists
        const session = sessionManager.get(sessionId);
        if (!session) {
          const availableSessions = sessionManager.list();
          return createToolError(
            `Session not found: ${sessionId}`,
            "The session may have already been ended",
            availableSessions.length > 0
              ? `Available sessions: ${availableSessions.join(", ")}`
              : "Create a session first with create_session."
          );
        }

        // Find the active page
        const pageResult = getActivePage(
          sessionManager,
          sessionId,
          pageIdentifier
        );
        if (!pageResult.success) {
          return createToolError(
            pageResult.error,
            `Session: ${sessionId}`,
            pageResult.availablePages
              ? `Available pages: ${pageResult.availablePages.join(", ")}`
              : undefined
          );
        }

        const { page } = pageResult;

        // Create a one-shot dialog handler
        const handler = async (dialog: Dialog) => {
          try {
            if (action === "accept") {
              await dialog.accept(promptText);
            } else {
              await dialog.dismiss();
            }
          } catch (err) {
            console.error("Dialog handler error:", err);
          }
          page.off("dialog", handler);
        };
        page.on("dialog", handler);

        return createToolResult({
          sessionId,
          action,
          promptText: promptText ?? null,
          registered: true,
          note: "Dialog handler registered. It will fire once when the next dialog appears. Now perform the action that triggers the dialog (e.g., click_element on a button).",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        return createToolError(
          "Failed to register dialog handler",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}
