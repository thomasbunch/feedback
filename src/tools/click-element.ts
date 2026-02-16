/**
 * click_element MCP tool
 * Clicks elements on web, Electron, or Tauri pages using Playwright Locator API
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createScreenshotResult } from "../utils/errors.js";
import { resolveSelector } from "../interaction/selectors.js";
import {
  validateSession,
  isToolResult,
  resolvePageOrError,
  captureAndOptimize,
  handleSelectorError,
} from "../utils/tool-helpers.js";

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
    "Click an element on a web, Electron, or Tauri page. Returns a screenshot after clicking. Use CSS selectors, text content, role, or test IDs to target elements.",
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
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
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
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

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
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "click",
            selector,
            button: button ?? "left",
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        return handleSelectorError(error, { selector, timeout, actionName: "click element" });
      }
    }
  );
}
