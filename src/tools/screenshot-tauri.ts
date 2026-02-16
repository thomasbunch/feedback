/**
 * screenshot_tauri MCP tool
 * Captures a screenshot of a running Tauri app via stored Page reference
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { resolveSelector } from "../interaction/selectors.js";
import { validateSession, isToolResult } from "../utils/tool-helpers.js";

/**
 * Register the screenshot_tauri tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerScreenshotTauriTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "screenshot_tauri",
    "Capture a screenshot of a running Tauri app (Windows only). Use after launch_tauri to see the current visual state.",
    {
      sessionId: z.string().describe("Session ID of the Tauri app"),
      fullPage: z
        .boolean()
        .optional()
        .describe("Capture full page (true) or viewport only (false, default)"),
      maxWidth: z
        .number()
        .int()
        .min(100)
        .max(3840)
        .optional()
        .describe("Max image width in pixels (default: 1280)"),
      quality: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("WebP quality 1-100 (default: 80)"),
      selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for element screenshot. Captures only this element instead of the full page. Cannot combine with fullPage."
        ),
    },
    async ({ sessionId, fullPage, maxWidth, quality, selector }) => {
      try {
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        const pageRef = sessionManager.getPageRef(sessionId, "tauri");
        if (!pageRef) {
          return createToolError(
            "No Tauri app found for this session",
            `Session ${sessionId} has no Tauri page reference`,
            "Launch a Tauri app first with launch_tauri."
          );
        }

        // Validate: selector and fullPage are mutually exclusive
        if (selector && fullPage) {
          return createToolError(
            "Cannot combine selector with fullPage",
            "Element screenshots are always cropped to the element's bounding box",
            "Remove fullPage when using selector, or remove selector to capture the full page."
          );
        }

        console.error(
          `[screenshot_tauri] Capturing for session ${sessionId}`
        );

        let rawBuffer: Buffer;
        let screenshotMode: string;

        if (selector) {
          // Element screenshot: use locator.screenshot()
          const locator = resolveSelector(pageRef.page, selector);
          rawBuffer = await locator.screenshot({ type: "png", timeout: 30000 });
          screenshotMode = "element";
        } else {
          // Full page or viewport screenshot (existing behavior)
          rawBuffer = await capturePlaywrightPage(pageRef.page, {
            fullPage: fullPage ?? false,
          });
          screenshotMode = fullPage ? "full-page" : "viewport";
        }

        // Optimize: resize + WebP conversion
        const optimized = await optimizeScreenshot(rawBuffer, {
          maxWidth: maxWidth ?? 1280,
          quality: quality ?? 80,
        });

        const imageBase64 = optimized.data.toString("base64");

        return createScreenshotResult(
          {
            sessionId,
            type: "tauri",
            mode: screenshotMode,
            selector: selector ?? undefined,
            width: optimized.width,
            height: optimized.height,
            originalSize: rawBuffer.length,
            optimizedSize: optimized.data.length,
          },
          imageBase64,
          optimized.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Failed to capture Tauri screenshot",
          message,
          "Ensure the Tauri app is still running and the window is visible."
        );
      }
    }
  );
}
