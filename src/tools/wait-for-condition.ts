/**
 * wait_for_condition MCP tool
 * Waits for a condition (network idle, JS expression, or URL response) before proceeding
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import {
  createToolError,
  createScreenshotResult,
} from "../utils/errors.js";
import {
  validateSession,
  isToolResult,
  resolvePageOrError,
  captureAndOptimize,
} from "../utils/tool-helpers.js";

/**
 * Register the wait_for_condition tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerWaitForConditionTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "wait_for_condition",
    "Wait for a condition before proceeding: network idle (no pending requests), a JavaScript expression to become truthy, or a specific URL to receive a response. Returns a screenshot after the condition is met. Useful after triggering async operations.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      type: z
        .enum(["network_idle", "javascript", "url"])
        .describe("Condition type to wait for"),
      expression: z
        .string()
        .min(1)
        .optional()
        .describe(
          "JavaScript expression that must evaluate to a truthy value. Required when type is 'javascript'."
        ),
      urlPattern: z
        .string()
        .min(1)
        .optional()
        .describe(
          "URL string or glob pattern to wait for a response from. Required when type is 'url'. Example: '**/api/data' or 'https://example.com/api/*'"
        ),
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
        .describe(
          "Max wait time in ms (default: 30000). For network_idle, this is the max time to wait for all pending requests to settle."
        ),
    },
    async ({
      sessionId,
      type,
      expression,
      urlPattern,
      pageIdentifier,
      timeout,
    }) => {
      try {
        // Validate type-specific required parameters
        if (type === "javascript" && !expression) {
          return createToolError(
            "Expression required for javascript condition",
            "type is 'javascript' but no expression was provided",
            "Provide a JavaScript expression that returns truthy when the condition is met, e.g., 'document.querySelector(\"#loaded\") !== null'"
          );
        }

        if (type === "url" && !urlPattern) {
          return createToolError(
            "URL pattern required for url condition",
            "type is 'url' but no urlPattern was provided",
            "Provide a URL or glob pattern, e.g., '**/api/data' or 'https://example.com/api/*'"
          );
        }

        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

        const effectiveTimeout = timeout ?? 30000;
        let extraMeta: Record<string, unknown> = {};

        if (type === "network_idle") {
          await page.waitForLoadState("networkidle", {
            timeout: effectiveTimeout,
          });
        } else if (type === "javascript") {
          await page.waitForFunction(expression!, {
            timeout: effectiveTimeout,
          });
        } else if (type === "url") {
          const response = await page.waitForResponse(
            (resp) => {
              if (urlPattern!.includes("*")) {
                const regexStr = urlPattern!
                  .replace(/\*\*/g, "___DOUBLESTAR___")
                  .replace(/\*/g, "[^/]*")
                  .replace(/___DOUBLESTAR___/g, ".*");
                return new RegExp(regexStr).test(resp.url());
              }
              return resp.url().includes(urlPattern!);
            },
            { timeout: effectiveTimeout }
          );
          extraMeta = {
            urlMatched: response.url(),
            status: response.status(),
          };
        }

        // Capture post-condition screenshot
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "wait",
            type,
            expression: expression ?? null,
            urlPattern: urlPattern ?? null,
            success: true,
            ...extraMeta,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Timeout errors
        if (
          message.includes("Timeout") ||
          message.includes("timeout")
        ) {
          return createToolError(
            "Condition not met within timeout",
            `${type} condition did not resolve within ${timeout ?? 30000}ms`,
            type === "network_idle"
              ? "The page may have persistent connections (WebSocket, polling). Try waiting for a specific JavaScript condition instead."
              : "Increase the timeout or verify the condition can be met. Take a screenshot to check current page state."
          );
        }

        // Default error
        return createToolError(
          "Failed to wait for condition",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}
