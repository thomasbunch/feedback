/**
 * select_option MCP tool
 * Selects options in <select> dropdowns on web, Electron, or Tauri pages using Playwright Locator API
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
 * Register the select_option tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerSelectOptionTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "select_option",
    "Select an option in a <select> dropdown by value, label, or index. Returns a screenshot after selection. For custom dropdowns (React Select, Material UI), use click_element instead.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      selector: z
        .string()
        .describe(
          "Selector targeting a <select> element. CSS: #my-select, select[name='color']. Test ID: testid=color-dropdown"
        ),
      value: z
        .string()
        .optional()
        .describe("Select option by its value attribute"),
      label: z
        .string()
        .optional()
        .describe("Select option by its visible text label"),
      index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Select option by zero-based index"),
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
    async ({ sessionId, selector, value, label, index, pageIdentifier, timeout }) => {
      try {
        // Validate exactly one selection method is provided
        const methodCount = [value, label, index].filter((v) => v !== undefined).length;
        if (methodCount !== 1) {
          return createToolError(
            "Provide exactly one of: value, label, or index",
            `Got ${methodCount} selection methods`,
            "Use value to select by option value attribute, label to select by visible text, or index to select by position (zero-based)."
          );
        }

        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

        // Resolve selector to Playwright Locator
        const locator = resolveSelector(page, selector);

        // Build selectOption argument based on selection method
        let arg: string | { label: string } | { index: number };
        const selectionInfo: Record<string, unknown> = {};

        if (value !== undefined) {
          arg = value;
          selectionInfo.value = value;
        } else if (label !== undefined) {
          arg = { label };
          selectionInfo.label = label;
        } else {
          arg = { index: index! };
          selectionInfo.index = index;
        }

        // Perform the selection
        await locator.selectOption(arg, { timeout: timeout ?? 30000 });

        // Capture post-selection screenshot
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "select",
            selector,
            ...selectionInfo,
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Not a <select> element
        if (
          message.includes("not a <select> element") ||
          message.includes("Element is not a")
        ) {
          return createToolError(
            "Element is not a <select> dropdown",
            `Selector "${selector}" matched an element that is not a native <select>`,
            "Use click_element for custom dropdown components (React Select, Material UI, etc.)."
          );
        }

        return handleSelectorError(error, { selector, timeout, actionName: "select option" });
      }
    }
  );
}
