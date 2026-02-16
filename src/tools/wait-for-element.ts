/**
 * wait_for_element MCP tool
 * Waits for an element to reach a specific state (visible, hidden, attached, detached)
 * and returns a screenshot after the wait since the page likely changed.
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
} from "../utils/tool-helpers.js";

/**
 * Register the wait_for_element tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerWaitForElementTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "wait_for_element",
    "Wait for an element to reach a specific state. Use before interacting with elements that may not be ready yet (loading spinners, disabled buttons, lazy content).",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      selector: z
        .string()
        .describe(
          "Element selector. CSS: #id, .class, div > span. Text: text=Click me. Role: role=button[name='Submit']. Test ID: testid=my-btn"
        ),
      state: z
        .enum(["visible", "hidden", "attached", "detached"])
        .describe(
          "Target state to wait for. 'visible': element visible on page. 'hidden': element hidden or removed. 'attached': element in DOM (may be hidden). 'detached': element removed from DOM."
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
    async ({ sessionId, selector, state, pageIdentifier, timeout }) => {
      try {
        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

        const effectiveTimeout = timeout ?? 30000;

        // Resolve selector to Playwright Locator
        const locator = resolveSelector(page, selector);

        // Wait for the specified state
        await locator.waitFor({ state, timeout: effectiveTimeout });

        // Capture post-wait screenshot (page likely changed during wait)
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "wait_for_element",
            selector,
            state,
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Strict mode violation: selector matched multiple elements
        if (message.includes("strict mode violation")) {
          return createToolError(
            "Selector matched multiple elements",
            `Selector "${selector}" matched more than one element (strict mode violation)`,
            "Use a more specific selector or add :nth-child(), :first-of-type, or similar to target a single element."
          );
        }

        // Timeout: element did not reach expected state
        if (
          message.includes("Timeout") ||
          message.includes("timeout")
        ) {
          return createToolError(
            `Element did not reach state '${state}' within ${timeout ?? 30000}ms`,
            `Selector: "${selector}", target state: "${state}"`,
            `The element exists but did not become ${state}. Take a screenshot to see the current page state.`
          );
        }

        // Default error
        return createToolError(
          "Failed to wait for element",
          `Selector: "${selector}", state: "${state}" — ${message}`,
          "Take a screenshot to verify the element exists and is visible on the page."
        );
      }
    }
  );
}
