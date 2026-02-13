/**
 * resize_viewport MCP tool
 * Resizes the browser viewport to specific dimensions or a device preset for responsive testing
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { getActivePage } from "../interaction/selectors.js";

const VIEWPORT_PRESETS: Record<string, { width: number; height: number }> = {
  "mobile-small": { width: 320, height: 568 },
  "mobile": { width: 375, height: 812 },
  "mobile-large": { width: 430, height: 932 },
  "tablet": { width: 768, height: 1024 },
  "tablet-large": { width: 834, height: 1194 },
  "desktop": { width: 1280, height: 720 },
  "desktop-large": { width: 1920, height: 1080 },
};

/**
 * Register the resize_viewport tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerResizeViewportTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "resize_viewport",
    "Resize the browser viewport to specific dimensions or a device preset for responsive testing. Returns a screenshot at the new size. Use to test mobile, tablet, and desktop layouts.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      width: z
        .number()
        .int()
        .min(200)
        .optional()
        .describe("Viewport width in pixels (min 200)"),
      height: z
        .number()
        .int()
        .min(200)
        .optional()
        .describe("Viewport height in pixels (min 200)"),
      preset: z
        .enum([
          "mobile-small",
          "mobile",
          "mobile-large",
          "tablet",
          "tablet-large",
          "desktop",
          "desktop-large",
        ])
        .optional()
        .describe(
          "Device size preset. Cannot be combined with width/height."
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL or 'electron' to target a specific page. Omit if session has only one page."
        ),
    },
    async ({ sessionId, width, height, preset, pageIdentifier }) => {
      try {
        // Validate parameter combinations
        const hasCustom = width !== undefined || height !== undefined;
        const hasPreset = preset !== undefined;

        if (!hasCustom && !hasPreset) {
          return createToolError(
            "Provide width+height or a preset",
            "Neither custom dimensions nor a preset was specified",
            "Use width and height together, or use a preset like 'mobile', 'tablet', 'desktop'"
          );
        }

        if (hasCustom && hasPreset) {
          return createToolError(
            "Provide width+height or a preset, not both",
            "Got both custom dimensions and a preset",
            "Use width and height for custom sizes, or use a preset for standard device sizes"
          );
        }

        if (hasCustom && (width === undefined || height === undefined)) {
          return createToolError(
            "Both width and height are required for custom dimensions",
            `Got only ${width !== undefined ? "width" : "height"}`,
            "Provide both width and height, or use a preset instead"
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

        // Determine dimensions
        const dims = hasPreset
          ? VIEWPORT_PRESETS[preset!]
          : { width: width!, height: height! };

        // Resize viewport
        await page.setViewportSize({
          width: dims.width,
          height: dims.height,
        });

        // Wait for CSS media queries to re-evaluate
        await page.waitForTimeout(200);

        // Capture post-resize screenshot
        const rawBuffer = await capturePlaywrightPage(page, {
          fullPage: false,
        });
        const optimized = await optimizeScreenshot(rawBuffer, {
          maxWidth: dims.width,
          quality: 80,
        });
        const imageBase64 = optimized.data.toString("base64");

        return createScreenshotResult(
          {
            sessionId,
            action: "resize",
            width: dims.width,
            height: dims.height,
            preset: preset ?? null,
            success: true,
          },
          imageBase64,
          optimized.mimeType
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Default error
        return createToolError(
          "Failed to resize viewport",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}
