/**
 * get_element_state MCP tool
 * Reads comprehensive UI element state in a single call: text, visibility,
 * enabled/editable status, attributes, and bounding box.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { resolveSelector, getActivePage } from "../interaction/selectors.js";

/**
 * Register the get_element_state tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerGetElementStateTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_element_state",
    "Read element state: text, visibility, enabled, attributes. Use to verify UI state without taking a screenshot.",
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
          "URL or 'electron' to target a specific page. Omit if session has only one page."
        ),
      attributes: z
        .array(z.string())
        .optional()
        .describe(
          "Attribute names to read (e.g., ['href', 'class', 'aria-label']). Omit to skip attribute reading."
        ),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Max wait time in ms (default: 30000)"),
    },
    async ({ sessionId, selector, pageIdentifier, attributes, timeout }) => {
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

        // Resolve selector to Playwright Locator
        const locator = resolveSelector(page, selector);

        // Auto-wait gate: ensure element is in DOM before reading state
        await locator.waitFor({
          state: "attached",
          timeout: effectiveTimeout,
        });

        // Read core state properties in parallel
        const [text, innerTextVal, visible, enabled, editable] =
          await Promise.all([
            locator.textContent({ timeout: effectiveTimeout }),
            locator.innerText({ timeout: effectiveTimeout }),
            locator.isVisible(),
            locator.isEnabled({ timeout: effectiveTimeout }),
            locator.isEditable({ timeout: effectiveTimeout }).catch(() => false),
          ]);

        // Read optional properties (return null for non-applicable elements)
        const [inputVal, checked] = await Promise.all([
          locator.inputValue({ timeout: effectiveTimeout }).catch(() => null),
          locator.isChecked({ timeout: effectiveTimeout }).catch(() => null),
        ]);

        // Read bounding box (null if element not visible)
        const box = await locator.boundingBox();

        // Read requested attributes
        const attrs: Record<string, string | null> = {};
        if (attributes) {
          for (const name of attributes) {
            attrs[name] = await locator.getAttribute(name, {
              timeout: effectiveTimeout,
            });
          }
        }

        // Return structured state (text-only, no screenshot)
        return createToolResult({
          selector,
          visible,
          enabled,
          editable,
          checked,
          textContent: text,
          innerText: innerTextVal,
          inputValue: inputVal,
          attributes: attrs,
          boundingBox: box,
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
          "Failed to read element state",
          `Selector: "${selector}" — ${message}`,
          "Take a screenshot to verify the element exists and is visible on the page."
        );
      }
    }
  );
}
