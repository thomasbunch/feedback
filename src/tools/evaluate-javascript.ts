/**
 * evaluate_javascript MCP tool
 * Executes JavaScript in the page context and returns the serialized result
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { getActivePage } from "../interaction/selectors.js";

/**
 * Register the evaluate_javascript tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerEvaluateJavascriptTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "evaluate_javascript",
    "Execute JavaScript in the page context and return the result. Use for reading page state, extracting data, or performing DOM operations. Returns serialized result (primitives, objects, arrays). Non-serializable values (DOM nodes, functions) return undefined.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      expression: z
        .string()
        .describe(
          "JavaScript expression or code to evaluate. Runs in the page context with access to document, window, etc. Must be a single expression or wrapped in an IIFE for multi-statement code."
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
        .describe("Max evaluation time in ms (default: 30000)"),
    },
    async ({ sessionId, expression, pageIdentifier, timeout }) => {
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

        // Evaluate the expression with timeout
        const result = await Promise.race([
          page.evaluate(expression),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Evaluation timed out after ${effectiveTimeout}ms`
                  )
                ),
              effectiveTimeout
            )
          ),
        ]);

        // Determine the result type
        let resultType: string;
        if (result === null) resultType = "null";
        else if (result === undefined) resultType = "undefined";
        else if (Array.isArray(result)) resultType = "array";
        else resultType = typeof result;

        // Serialize the result
        const serialized =
          result === undefined ? undefined : JSON.stringify(result, null, 2);

        // Build the response
        const truncatedExpression =
          expression.length > 200
            ? expression.substring(0, 200) + "..."
            : expression;

        if (resultType === "undefined") {
          return createToolResult({
            expression: truncatedExpression,
            resultType,
            result: null,
            note: "Result is undefined. This may indicate the expression returned undefined, or returned a non-serializable value (DOM node, function, etc.)",
          });
        }

        return createToolResult({
          expression: truncatedExpression,
          resultType,
          result: serialized !== undefined ? JSON.parse(serialized) : null,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // JavaScript evaluation errors
        if (
          message.includes("Evaluation failed") ||
          message.includes("ReferenceError") ||
          message.includes("TypeError") ||
          message.includes("SyntaxError")
        ) {
          return createToolError(
            "JavaScript evaluation error",
            message,
            "Check your JavaScript expression syntax and ensure referenced variables/functions exist in the page context."
          );
        }

        // Timeout errors
        if (message.includes("timed out")) {
          return createToolError(
            "Evaluation timed out",
            `Expression did not complete within ${timeout ?? 30000}ms`,
            "The expression may be stuck in an infinite loop or waiting for something. Simplify the expression or increase the timeout."
          );
        }

        // Default error
        return createToolError(
          "Failed to evaluate JavaScript",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}
