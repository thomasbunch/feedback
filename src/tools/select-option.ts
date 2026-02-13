/**
 * select_option MCP tool
 * Selects options in <select> dropdowns on web or Electron pages using Playwright Locator API
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { resolveSelector, getActivePage } from "../interaction/selectors.js";

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
          "URL or 'electron' to target a specific page. Omit if session has only one page."
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
            action: "select",
            selector,
            ...selectionInfo,
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
          "Failed to select option",
          `Selector: "${selector}" — ${message}`,
          "Take a screenshot to verify the element exists and is a <select> dropdown."
        );
      }
    }
  );
}
