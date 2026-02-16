/**
 * get_accessibility_tree MCP tool
 * Captures the page's accessibility tree as a YAML-formatted ARIA snapshot
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { resolveSelector } from "../interaction/selectors.js";
import {
  validateSession,
  isToolResult,
  resolvePageOrError,
} from "../utils/tool-helpers.js";

/**
 * Register the get_accessibility_tree tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerGetAccessibilityTreeTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_accessibility_tree",
    "Capture the page's accessibility tree as a YAML-formatted ARIA snapshot. Shows the role/name hierarchy visible to screen readers and assistive technologies. Use to verify semantic structure, ARIA labels, and heading hierarchy.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
        ),
      selector: z
        .string()
        .min(1)
        .optional()
        .describe(
          "CSS selector to scope tree capture to a specific element. Omit for full page (body)."
        ),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Max time in ms to wait for accessibility tree (default: 30000)"),
    },
    async ({ sessionId, pageIdentifier, selector, timeout }) => {
      try {
        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;
        const effectiveTimeout = timeout ?? 30000;

        // Determine the target locator
        const locator = selector
          ? resolveSelector(page, selector)
          : page.locator("body");

        // Capture the accessibility tree as YAML
        const snapshot = await locator.ariaSnapshot({ timeout: effectiveTimeout });

        return createToolResult({
          selector: selector ?? "body",
          snapshot,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Timeout errors
        if (message.includes("Timeout") || message.includes("timed out")) {
          return createToolError(
            "Accessibility tree capture timed out",
            `Could not capture the tree within ${timeout ?? 30000}ms`,
            "The element may not exist or the page may be loading. Use wait_for_element first, then retry."
          );
        }

        // Element not found
        if (
          message.includes("not found") ||
          message.includes("No element") ||
          message.includes("strict mode")
        ) {
          return createToolError(
            "Element not found for accessibility tree",
            message,
            "Check the selector and ensure the element exists. Take a screenshot to verify."
          );
        }

        // Default error
        return createToolError(
          "Failed to capture accessibility tree",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}
