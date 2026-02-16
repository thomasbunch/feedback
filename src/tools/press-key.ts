/**
 * press_key MCP tool
 * Presses keyboard keys or key combinations on web, Electron, or Tauri pages using Playwright
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { resolveSelector } from "../interaction/selectors.js";
import {
  validateSession,
  isToolResult,
  resolvePageOrError,
  captureAndOptimize,
  handleSelectorError,
} from "../utils/tool-helpers.js";

/**
 * Register the press_key tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerPressKeyTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "press_key",
    "Press a keyboard key or key combination. Use with a selector to press on a specific element, or without to send to the page (e.g., Escape to close modals). Returns a screenshot after the keypress.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      key: z
        .string()
        .min(1)
        .describe(
          "Key name or combination: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, Control+A, Shift+Tab, Meta+C"
        ),
      selector: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Element to focus before pressing key. If omitted, key is sent to the page. CSS: #input, .field. Test ID: testid=my-input"
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
        ),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Max wait time in ms (default: 30000)"),
    },
    async ({ sessionId, key, selector, pageIdentifier, timeout }) => {
      try {
        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

        // Press key on element or page
        if (selector) {
          const locator = resolveSelector(page, selector);
          await locator.press(key, { timeout: timeout ?? 30000 });
        } else {
          await page.keyboard.press(key);
        }

        // Capture post-keypress screenshot
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "press_key",
            key,
            selector: selector ?? null,
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Unknown key name
        if (message.includes("Unknown key")) {
          return createToolError(
            "Unknown key name",
            `Key "${key}" is not a valid Playwright key name`,
            "Valid keys: Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, F1-F12. Modifiers: Control, Shift, Alt, Meta. Combos: Control+A, Shift+Tab"
          );
        }

        return handleSelectorError(error, { selector: selector ?? key, timeout, actionName: "press key" });
      }
    }
  );
}
