/**
 * scroll MCP tool
 * Scrolls the page or specific elements on web, Electron, or Tauri pages using Playwright
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
 * Register the scroll tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerScrollTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "scroll",
    "Scroll the page or a specific element. Scroll an element into view, scroll by pixels in a direction, or jump to top/bottom. Returns a screenshot after scrolling.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      target: z
        .string()
        .min(1)
        .optional()
        .describe(
          "CSS selector of element to scroll into view, or container to scroll within. CSS: #content, .scroll-area. Test ID: testid=scroll-container"
        ),
      direction: z
        .enum(["up", "down", "left", "right"])
        .optional()
        .describe("Scroll direction for pixel-based scrolling"),
      amount: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Pixels to scroll (default: 500)"),
      scrollTo: z
        .enum(["top", "bottom"])
        .optional()
        .describe("Scroll to absolute position within the page or target element"),
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
    async ({ sessionId, target, direction, amount, scrollTo, pageIdentifier, timeout }) => {
      try {
        // Validate at least one scroll parameter is provided
        if (!target && !direction && !scrollTo) {
          return createToolError(
            "No scroll parameters provided",
            "At least one of target, direction, or scrollTo must be specified",
            "Use target to scroll an element into view, direction to scroll by pixels, or scrollTo to jump to top/bottom."
          );
        }

        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

        let scrollMode: string;

        if (direction) {
          // Mode B: Pixel-based directional scrolling
          scrollMode = `direction:${direction}`;
          const pixels = amount ?? 500;
          let deltaX = 0;
          let deltaY = 0;

          switch (direction) {
            case "up":
              deltaY = -pixels;
              break;
            case "down":
              deltaY = pixels;
              break;
            case "left":
              deltaX = -pixels;
              break;
            case "right":
              deltaX = pixels;
              break;
          }

          // If target specified, hover over container first to ensure scroll events go there
          if (target) {
            const container = resolveSelector(page, target);
            await container.hover({ timeout: timeout ?? 30000 });
          }

          await page.mouse.wheel(deltaX, deltaY);
          await new Promise((resolve) => setTimeout(resolve, 150));
        } else if (scrollTo) {
          // Mode C: Scroll to absolute position (top/bottom)
          scrollMode = `scrollTo:${scrollTo}`;

          await page.evaluate(
            ({ selector, position }) => {
              const el = selector
                ? document.querySelector(selector)
                : document.documentElement;
              if (!el) throw new Error(`Element not found: ${selector}`);
              const scrollable =
                el instanceof HTMLElement ? el : document.documentElement;
              if (position === "top") {
                scrollable.scrollTop = 0;
              } else {
                scrollable.scrollTop = scrollable.scrollHeight;
              }
            },
            { selector: target ?? null, position: scrollTo }
          );
          await new Promise((resolve) => setTimeout(resolve, 150));
        } else {
          // Mode A: Scroll element into view (target provided, no direction/scrollTo)
          scrollMode = "intoView";
          const locator = resolveSelector(page, target!);
          await locator.scrollIntoViewIfNeeded({ timeout: timeout ?? 30000 });
        }

        // Capture post-scroll screenshot
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "scroll",
            target: target ?? null,
            scrollMode,
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        if (target) {
          return handleSelectorError(error, { selector: target, timeout: timeout ?? 30000, actionName: "scroll" });
        }
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Failed to scroll",
          message,
          "Take a screenshot to verify the page state and element existence."
        );
      }
    }
  );
}
