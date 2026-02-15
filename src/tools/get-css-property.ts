/**
 * get_css_property MCP tool
 * Reads computed CSS property values for a DOM element using getComputedStyle
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { getActivePage, resolveSelector } from "../interaction/selectors.js";

/**
 * Register the get_css_property tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerGetCssPropertyTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "get_css_property",
    "Read computed CSS property values for a DOM element. Returns the browser's final computed values including inheritance, cascading, and media queries. Use to verify styling — colors, sizes, layout, visibility, and other visual properties.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      selector: z
        .string()
        .describe(
          "Element selector. CSS: #id, .class, tag. Text: text=Click me. Role: role=button. Test ID: testid=my-btn"
        ),
      property: z
        .string()
        .optional()
        .describe(
          "Single CSS property name (e.g., 'color', 'display', 'font-size'). Use this OR properties, not both."
        ),
      properties: z
        .array(z.string())
        .optional()
        .describe(
          "Multiple CSS property names to read at once (e.g., ['color', 'display', 'font-size']). Use this OR property, not both."
        ),
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
        .describe("Max wait time in ms for element (default: 30000)"),
    },
    async ({ sessionId, selector, property, properties, pageIdentifier, timeout }) => {
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

        // Validate at least one property is provided
        if (!property && (!properties || properties.length === 0)) {
          return createToolError(
            "Must provide either 'property' or 'properties'",
            "No CSS property names specified",
            "Use property for a single value (e.g., property: 'color') or properties for multiple (e.g., properties: ['color', 'display'])."
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

        // Build the list of properties to read
        const propsToRead: string[] = properties ?? (property ? [property] : []);

        // Resolve selector and wait for the element
        const locator = resolveSelector(page, selector);
        const effectiveTimeout = timeout ?? 30000;
        await locator.waitFor({ state: "attached", timeout: effectiveTimeout });

        // Read computed CSS values
        const values = await locator.evaluate(
          (el: Element, props: string[]) => {
            const style = window.getComputedStyle(el);
            const result: Record<string, string> = {};
            for (const prop of props) {
              result[prop] = style.getPropertyValue(prop);
            }
            return result;
          },
          propsToRead
        );

        return createToolResult({
          selector,
          properties: values,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Timeout / element not found errors
        if (
          message.includes("Timeout") ||
          message.includes("waiting for") ||
          message.includes("locator.waitFor")
        ) {
          return createToolError(
            "Element not found within timeout",
            `selector: ${selector}, timeout: ${timeout ?? 30000}ms`,
            "Check that the selector matches an element on the page. Take a screenshot to verify page state."
          );
        }

        return createToolError(
          "Failed to read CSS properties",
          message,
          "Check the selector and ensure a page is loaded in the session."
        );
      }
    }
  );
}
