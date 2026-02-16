/**
 * get_page_content MCP tool
 * Extracts text or HTML content from a web/Electron/Tauri page or a specific element
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
  handleSelectorError,
} from "../utils/tool-helpers.js";

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
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
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
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

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
        // If no selector was provided, this is a page-level error not selector-related
        if (!selector) {
          const message =
            error instanceof Error ? error.message : String(error);
          return createToolError(
            "Failed to extract page content",
            message,
            "Take a screenshot to verify the page state."
          );
        }

        return handleSelectorError(error, { selector, timeout, actionName: "extract page content" });
      }
    }
  );
}
