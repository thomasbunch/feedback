/**
 * drag_drop MCP tool
 * Drags elements from a source to a target using Playwright's locator.dragTo()
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
 * Register the drag_drop tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerDragDropTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "drag_drop",
    "Drag an element and drop it on a target element. Returns a screenshot after the operation. Use CSS selectors, text content, role, or test IDs for source and target.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      sourceSelector: z
        .string()
        .min(1)
        .describe(
          "Selector for the element to drag. CSS: #id, .class. Text: text=Drag me. Role: role=listitem. Test ID: testid=drag-source"
        ),
      targetSelector: z
        .string()
        .min(1)
        .describe(
          "Selector for the drop target element. CSS: #id, .class. Text: text=Drop here. Role: role=region. Test ID: testid=drop-target"
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
        ),
      force: z
        .boolean()
        .optional()
        .describe("Bypass actionability checks (use sparingly)"),
      sourcePosition: z
        .object({ x: z.number(), y: z.number() })
        .optional()
        .describe("Point within source element to start the drag"),
      targetPosition: z
        .object({ x: z.number(), y: z.number() })
        .optional()
        .describe("Point within target element to drop"),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Max wait time in ms (default: 30000)"),
    },
    async ({
      sessionId,
      sourceSelector,
      targetSelector,
      pageIdentifier,
      force,
      sourcePosition,
      targetPosition,
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

        // Resolve source and target selectors to Playwright Locators
        const sourceLocator = resolveSelector(page, sourceSelector);
        const targetLocator = resolveSelector(page, targetSelector);

        // Perform the drag-and-drop operation
        await sourceLocator.dragTo(targetLocator, {
          force: force ?? undefined,
          sourcePosition: sourcePosition ?? undefined,
          targetPosition: targetPosition ?? undefined,
          timeout: timeout ?? 30000,
        });

        // Wait briefly for UI updates after the drop
        await Promise.race([
          page.waitForLoadState("load").catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);

        // Capture post-drag screenshot
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "drag_drop",
            sourceSelector,
            targetSelector,
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
            `Source "${sourceSelector}" or target "${targetSelector}" matched more than one element (strict mode violation)`,
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
            `Source "${sourceSelector}" or target "${targetSelector}" did not match any visible element within ${timeout ?? 30000}ms`,
            "Check the selectors are correct, the elements are visible, or increase the timeout. Take a screenshot first to verify the page state."
          );
        }

        // Default error
        return createToolError(
          "Failed to drag and drop",
          `Source: "${sourceSelector}", Target: "${targetSelector}" — ${message}`,
          "Take a screenshot to verify the elements exist and are visible on the page."
        );
      }
    }
  );
}
