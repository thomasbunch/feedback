/**
 * press_key MCP tool
 * Presses keyboard keys or key combinations on web or Electron pages using Playwright
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { resolveSelector, getActivePage } from "../interaction/selectors.js";

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
        .describe(
          "Key name or combination: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, Control+A, Shift+Tab, Meta+C"
        ),
      selector: z
        .string()
        .optional()
        .describe(
          "Element to focus before pressing key. If omitted, key is sent to the page. CSS: #input, .field. Test ID: testid=my-input"
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL or 'electron' to target a specific page. Omit if session has only one page."
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

        // Press key on element or page
        if (selector) {
          const locator = resolveSelector(page, selector);
          await locator.press(key, { timeout: timeout ?? 30000 });
        } else {
          await page.keyboard.press(key);
        }

        // Capture post-keypress screenshot
        const rawBuffer = await capturePlaywrightPage(page, {
          fullPage: false,
        });
        const optimized = await optimizeScreenshot(rawBuffer, {
          maxWidth: 1280,
          quality: 80,
        });
        const imageBase64 = optimized.data.toString("base64");

        return createScreenshotResult(
          {
            sessionId,
            action: "press_key",
            key,
            selector: selector ?? null,
            success: true,
          },
          imageBase64,
          optimized.mimeType
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

        // Strict mode violation: selector matched multiple elements
        if (message.includes("strict mode violation")) {
          return createToolError(
            "Selector matched multiple elements",
            `Selector "${selector}" matched more than one element (strict mode violation)`,
            "Use a more specific selector or add :nth-child(), :first-of-type, or similar to target a single element."
          );
        }

        // Timeout: element not found or not actionable within timeout
        if (
          message.includes("Timeout") ||
          message.includes("timeout")
        ) {
          return createToolError(
            "Element not found within timeout",
            `Selector "${selector}" did not match any visible element within ${timeout ?? 30000}ms`,
            "Check the selector is correct, the element is visible, or increase the timeout. Take a screenshot first to verify the page state."
          );
        }

        // Default error
        return createToolError(
          "Failed to press key",
          `Key: "${key}"${selector ? `, Selector: "${selector}"` : ""} — ${message}`,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}
