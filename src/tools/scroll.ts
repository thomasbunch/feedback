/**
 * scroll MCP tool
 * Scrolls the page or specific elements on web or Electron pages using Playwright
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { resolveSelector, getActivePage } from "../interaction/selectors.js";

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
          "URL or 'electron' to target a specific page. Omit if session has only one page."
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
            action: "scroll",
            target: target ?? null,
            scrollMode,
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
            `Target "${target}" matched more than one element (strict mode violation)`,
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
            `Target "${target}" did not match any visible element within ${timeout ?? 30000}ms`,
            "Check the selector is correct, the element is visible, or increase the timeout. Take a screenshot first to verify the page state."
          );
        }

        // Default error
        return createToolError(
          "Failed to scroll",
          `${target ? `Target: "${target}" — ` : ""}${message}`,
          "Take a screenshot to verify the page state and element existence."
        );
      }
    }
  );
}
