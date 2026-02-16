/**
 * type_text MCP tool
 * Types text into input fields on web, Electron, or Tauri pages using Playwright Locator API
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
 * Register the type_text tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerTypeTextTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "type_text",
    "Type text into an input field or textarea on a web, Electron, or Tauri page. Returns a screenshot after typing. Uses fill (paste) by default; set pressSequentially for apps with keystroke handlers.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      selector: z
        .string()
        .describe(
          "Element selector for the input field. CSS: #email, .search-box, input[name='query']. Role: role=textbox[name='Email']. Test ID: testid=search-input"
        ),
      text: z
        .string()
        .describe("Text to type into the field"),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
        ),
      pressSequentially: z
        .boolean()
        .optional()
        .describe(
          "Type one character at a time instead of fill/paste (default: false). Use for inputs with autocomplete or per-keystroke handlers."
        ),
      delay: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Delay between keystrokes in ms (only used with pressSequentially, default: 50)"
        ),
      clear: z
        .boolean()
        .optional()
        .describe(
          "Clear the field before typing (default: true). Set false to append text."
        ),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Max wait time in ms for element readiness (default: 30000)"),
    },
    async ({
      sessionId,
      selector,
      text,
      pageIdentifier,
      pressSequentially,
      delay,
      clear,
      timeout,
    }) => {
      try {
        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

        // Resolve selector to Playwright Locator
        const locator = resolveSelector(page, selector);

        const effectiveTimeout = timeout ?? 30000;

        // Perform the type action based on mode
        if (clear === false && pressSequentially) {
          // Append mode + pressSequentially: click to focus, then type char-by-char
          await locator.click({ timeout: effectiveTimeout });
          await locator.pressSequentially(text, {
            delay: delay ?? 50,
            timeout: effectiveTimeout,
          });
        } else if (pressSequentially) {
          // Clear first, then type char-by-char
          await locator.fill("", { timeout: effectiveTimeout });
          await locator.pressSequentially(text, {
            delay: delay ?? 50,
            timeout: effectiveTimeout,
          });
        } else if (clear === false) {
          // Append mode + fill: click to focus, then insertText to append
          await locator.click({ timeout: effectiveTimeout });
          await page.keyboard.insertText(text);
        } else {
          // Default: fill() clears and types in one step
          await locator.fill(text, { timeout: effectiveTimeout });
        }

        // Capture post-type screenshot
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "type",
            selector,
            textLength: text.length,
            mode: pressSequentially ? "pressSequentially" : "fill",
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Element is not editable (not an input/textarea/contenteditable)
        if (
          message.includes("not an <input>") ||
          message.includes("not editable") ||
          message.includes("Element is not")
        ) {
          return createToolError(
            "Element is not a text input",
            `Selector "${selector}" matched an element that cannot accept text input`,
            "Ensure the selector targets an <input>, <textarea>, or contenteditable element. Take a screenshot to verify."
          );
        }

        return handleSelectorError(error, { selector, timeout, actionName: "type text" });
      }
    }
  );
}
