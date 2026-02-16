/**
 * file_upload MCP tool
 * Uploads files to a file input element on web, Electron, or Tauri pages
 */

import { z } from "zod";
import { existsSync } from "fs";
import { resolve as resolvePath } from "path";
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
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
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
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Find the active page
        const resolved = resolvePageOrError(sessionManager, sessionId, pageIdentifier);
        if (isToolResult(resolved)) return resolved;
        const { page } = resolved;

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
        const screenshot = await captureAndOptimize(page);

        return createScreenshotResult(
          {
            sessionId,
            action: "upload",
            selector,
            fileCount: files.length,
            success: true,
          },
          screenshot.imageBase64,
          screenshot.mimeType
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

        return handleSelectorError(error, { selector, timeout, actionName: "upload file" });
      }
    }
  );
}
