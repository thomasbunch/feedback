/**
 * file_upload MCP tool
 * Uploads files to a file input element on web or Electron pages
 */

import { z } from "zod";
import { existsSync } from "fs";
import { resolve as resolvePath } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { resolveSelector, getActivePage } from "../interaction/selectors.js";

/**
 * Register the file_upload tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerFileUploadTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "file_upload",
    "Upload one or more files to a file input element. The selector must target an <input type='file'>. Returns a screenshot after upload.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      selector: z
        .string()
        .describe(
          "Selector targeting an <input type='file'> element. CSS: #file-input, input[type='file']. Test ID: testid=file-input"
        ),
      files: z
        .array(z.string())
        .min(1)
        .describe("Array of absolute file paths to upload"),
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
    async ({ sessionId, selector, files, pageIdentifier, timeout }) => {
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

        // Validate file paths exist before calling Playwright
        const resolvedFiles = files.map((f) => resolvePath(f));
        const missing = resolvedFiles.filter((f) => !existsSync(f));
        if (missing.length > 0) {
          return createToolError(
            "File(s) not found",
            `Missing: ${missing.join(", ")}`,
            "Provide absolute file paths. Relative paths resolve from the Node.js process working directory."
          );
        }

        // Resolve selector to Playwright Locator
        const locator = resolveSelector(page, selector);

        // Upload files
        await locator.setInputFiles(resolvedFiles, {
          timeout: timeout ?? 30000,
        });

        // Capture post-upload screenshot
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
            action: "upload",
            selector,
            fileCount: files.length,
            success: true,
          },
          imageBase64,
          optimized.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Not a file input element
        if (
          message.includes("non-input element") ||
          message.includes("file input")
        ) {
          return createToolError(
            "Element is not a file input",
            `Selector "${selector}" matched an element that is not a file input`,
            "Selector must target an <input type='file'> element."
          );
        }

        // Strict mode violation: selector matched multiple elements
        if (message.includes("strict mode violation")) {
          return createToolError(
            "Selector matched multiple elements",
            `Selector "${selector}" matched more than one element (strict mode violation)`,
            "Use a more specific selector or add :nth-child(), :first-of-type, or similar to target a single element."
          );
        }

        // Timeout: element not found or not actionable within timeout
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
          "Failed to upload file(s)",
          `Selector: "${selector}" — ${message}`,
          "Ensure the selector targets an <input type='file'> element. Take a screenshot to verify the page state."
        );
      }
    }
  );
}
