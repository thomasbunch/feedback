/**
 * wait_for_element MCP tool
 * Waits for an element to reach a specific state (visible, hidden, attached, detached)
 * and returns a screenshot after the wait since the page likely changed.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { resolveSelector, getActivePage } from "../interaction/selectors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";

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
          "URL or 'electron' to target a specific page. Omit if session has only one page."
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
        const effectiveTimeout = timeout ?? 30000;

        // Resolve selector to Playwright Locator
        const locator = resolveSelector(page, selector);

        // Wait for the specified state
        await locator.waitFor({ state, timeout: effectiveTimeout });

        // Capture post-wait screenshot (page likely changed during wait)
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
            action: "wait_for_element",
            selector,
            state,
            success: true,
          },
          imageBase64,
          optimized.mimeType
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
