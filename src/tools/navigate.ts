/**
 * navigate MCP tool
 * Navigates to URLs and uses browser back/forward on web, Electron, or Tauri pages
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import {
  validateSession,
  isToolResult,
  resolvePageOrError,
  captureAndOptimize,
} from "../utils/tool-helpers.js";

/**
 * Register the navigate tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerNavigateTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "navigate",
    "Navigate to a URL or use browser back/forward on a web, Electron, or Tauri page. Returns a screenshot of the resulting page. Use to load pages, follow links, or retrace steps.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      action: z
        .enum(["goto", "back", "forward"])
        .default("goto")
        .describe(
          "Navigation action: goto (load URL), back (browser back), forward (browser forward)"
        ),
      url: z
        .string()
        .min(1)
        .optional()
        .describe("URL to navigate to (required when action is 'goto')"),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
        ),
      waitUntil: z
        .enum(["load", "domcontentloaded", "commit"])
        .optional()
        .describe(
          "When to consider navigation complete (default: 'load'). Do NOT use 'networkidle' — it is unreliable."
        ),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Max wait time in ms (default: 30000)"),
    },
    async ({
      sessionId,
      action,
      url,
      pageIdentifier,
      waitUntil,
      timeout,
    }) => {
      try {
        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Validate URL is provided for goto action
        if (action === "goto" && !url) {
          return createToolError(
            "URL is required when action is 'goto'",
            "The 'goto' action navigates to a specific URL",
            "Provide a url parameter, e.g. url: 'https://example.com'"
          );
        }

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page, identifier: currentIdentifier, type: pageType } = resolved;

        const effectiveTimeout = timeout ?? 30000;
        const effectiveWaitUntil = waitUntil ?? "load";

        // Perform the navigation action
        if (action === "goto") {
          await page.goto(url!, {
            waitUntil: effectiveWaitUntil,
            timeout: effectiveTimeout,
          });

          // Only re-key for URL-based identifiers (not fixed "electron"/"tauri" identifiers)
          const isUrlBased = pageType === "web" && currentIdentifier !== "electron" && currentIdentifier !== "tauri";
          if (isUrlBased) {
            sessionManager.rekeyIdentifier(sessionId, currentIdentifier, url!);
            // Update the URL field in the re-keyed page ref
            const updatedRef = sessionManager.getPageRef(sessionId, url!);
            if (updatedRef) {
              updatedRef.url = url!;
            }
          }
        } else if (action === "back") {
          const response = await page.goBack({
            waitUntil: effectiveWaitUntil,
            timeout: effectiveTimeout,
          });
          if (response === null) {
            return createToolError(
              "Cannot go back",
              "No previous page in browser history",
              "Navigate to a URL first before using back."
            );
          }
        } else {
          // action === "forward"
          const response = await page.goForward({
            waitUntil: effectiveWaitUntil,
            timeout: effectiveTimeout,
          });
          if (response === null) {
            return createToolError(
              "Cannot go forward",
              "No forward page in browser history",
              "Use back first before using forward."
            );
          }
        }

        // Capture post-navigation screenshot
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action,
            url: page.url(),
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Timeout: page took too long to load
        if (
          message.includes("Timeout") ||
          message.includes("timeout")
        ) {
          return createToolError(
            "Navigation timed out",
            `Page did not finish loading within ${timeout ?? 30000}ms`,
            "Increase the timeout, use waitUntil: 'domcontentloaded' for faster resolution, or check if the URL is correct."
          );
        }

        // Network errors (Chrome: net::ERR_, Firefox: NS_ERROR_)
        if (
          message.includes("net::ERR_") ||
          message.includes("NS_ERROR_")
        ) {
          return createToolError(
            "Network error during navigation",
            message,
            "Check if the URL is correct and the server is running. For local servers, ensure the dev server is started."
          );
        }

        // Default error
        return createToolError(
          "Navigation failed",
          `Action: ${action}, URL: ${url ?? "N/A"} — ${message}`,
          "Take a screenshot to check the current page state."
        );
      }
    }
  );
}
