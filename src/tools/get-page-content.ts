/**
 * get_page_content MCP tool
 * Extracts text or HTML content from a web/Electron page or a specific element
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { resolveSelector, getActivePage } from "../interaction/selectors.js";

/**
 * Register the get_page_content tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerGetPageContentTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_page_content",
    "Extract text or HTML content from the page or a specific element. Returns text data, not a screenshot. Use a selector for large pages to limit response size.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      selector: z
        .string()
        .optional()
        .describe(
          "CSS selector to extract from a specific element. If omitted, extracts from the full page."
        ),
      format: z
        .enum(["text", "html"])
        .optional()
        .describe(
          "Output format: 'text' returns visible text (innerText), 'html' returns HTML markup (innerHTML). Default: 'text'"
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL or 'electron' to target a specific page. Omit if session has only one page."
        ),
      maxLength: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "Truncate response to this many characters. Appends '[truncated]' indicator if truncated."
        ),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Max wait time in ms (default: 30000)"),
    },
    async ({ sessionId, selector, format, pageIdentifier, maxLength, timeout }) => {
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

        let content: string;

        if (selector) {
          // Extract from specific element
          const locator = resolveSelector(page, selector);
          await locator.waitFor({ state: "attached", timeout: effectiveTimeout });

          if (format === "html") {
            content = await locator.innerHTML({ timeout: effectiveTimeout });
          } else {
            content = await locator.innerText({ timeout: effectiveTimeout });
          }
        } else {
          // Extract from full page
          if (format === "html") {
            content = await page.content();
          } else {
            content = await page.evaluate(() => document.body.innerText);
          }
        }

        // Apply truncation if requested
        let truncated = false;
        if (maxLength && content.length > maxLength) {
          content = content.substring(0, maxLength);
          truncated = true;
        }

        return createToolResult({
          selector: selector ?? null,
          format: format ?? "text",
          length: content.length,
          truncated,
          content,
        });
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

        // Timeout: element not found or not attached within timeout
        if (
          message.includes("Timeout") ||
          message.includes("timeout")
        ) {
          return createToolError(
            "Element not found within timeout",
            `Selector "${selector}" did not match any element within ${timeout ?? 30000}ms`,
            "Check the selector is correct, the element exists in the DOM, or increase the timeout. Take a screenshot first to verify the page state."
          );
        }

        // Default error
        return createToolError(
          "Failed to extract page content",
          `${selector ? `Selector: "${selector}" — ` : ""}${message}`,
          "Take a screenshot to verify the page state and element existence."
        );
      }
    }
  );
}
