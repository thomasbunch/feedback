/**
 * click_element MCP tool
 * Clicks elements on web or Electron pages using Playwright Locator API
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { resolveSelector, getActivePage } from "../interaction/selectors.js";

/**
 * Register the click_element tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerClickElementTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "click_element",
    "Click an element on a web or Electron page. Returns a screenshot after clicking. Use CSS selectors, text content, role, or test IDs to target elements.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      selector: z
        .string()
        .describe(
          "Element selector. CSS: #id, .class, div > span. Text: text=Click me. Role: role=button[name='Submit']. Test ID: testid=my-btn"
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL or 'electron' to target a specific page. Omit if session has only one page."
        ),
      button: z
        .enum(["left", "right", "middle"])
        .optional()
        .describe("Mouse button (default: left)"),
      clickCount: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe("Number of clicks (2 for double-click)"),
      position: z
        .object({ x: z.number(), y: z.number() })
        .optional()
        .describe("Click position within element"),
      force: z
        .boolean()
        .optional()
        .describe("Bypass actionability checks (use sparingly)"),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Max wait time in ms (default: 30000)"),
    },
    async ({
      sessionId,
      selector,
      pageIdentifier,
      button,
      clickCount,
      position,
      force,
      timeout,
    }) => {
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

        // Resolve selector to Playwright Locator
        const locator = resolveSelector(page, selector);

        // Perform the click with provided options
        await locator.click({
          button: button ?? undefined,
          clickCount: clickCount ?? undefined,
          position: position ?? undefined,
          force: force ?? undefined,
          timeout: timeout ?? 30000,
        });

        // Wait briefly for any navigation triggered by the click
        await Promise.race([
          page.waitForLoadState("load").catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);

        // Capture post-click screenshot
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
            action: "click",
            selector,
            button: button ?? "left",
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
          "Failed to click element",
          `Selector: "${selector}" — ${message}`,
          "Take a screenshot to verify the element exists and is visible on the page."
        );
      }
    }
  );
}
