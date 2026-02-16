/**
 * hover_element MCP tool
 * Hovers over elements on web, Electron, or Tauri pages using Playwright Locator API
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
 * Register the hover_element tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerHoverElementTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "hover_element",
    "Hover over an element to trigger hover states, tooltips, or dropdown menus. Returns a screenshot showing the hover effect.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      selector: z
        .string()
        .min(1)
        .describe(
          "Element to hover over. CSS: #menu-item, .tooltip-trigger. Text: text=Help. Test ID: testid=hover-target"
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
        ),
      position: z
        .object({ x: z.number(), y: z.number() })
        .optional()
        .describe("Hover position within the element (relative coordinates)"),
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
    async ({ sessionId, selector, pageIdentifier, position, force, timeout }) => {
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

        // Perform the hover with provided options
        await locator.hover({
          position: position ?? undefined,
          force: force ?? undefined,
          timeout: timeout ?? 30000,
        });

        // Capture screenshot immediately (hover state is transient)
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "hover",
            selector,
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        return handleSelectorError(error, { selector, timeout, actionName: "hover element" });
      }
    }
  );
}
