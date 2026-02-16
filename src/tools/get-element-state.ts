/**
 * get_element_state MCP tool
 * Reads comprehensive UI element state in a single call: text, visibility,
 * enabled/editable status, attributes, and bounding box.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolResult } from "../utils/errors.js";
import { resolveSelector } from "../interaction/selectors.js";
import {
  validateSession,
  isToolResult,
  resolvePageOrError,
  handleSelectorError,
} from "../utils/tool-helpers.js";

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
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
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
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

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
        return handleSelectorError(error, { selector, timeout, actionName: "read element state" });
      }
    }
  );
}
