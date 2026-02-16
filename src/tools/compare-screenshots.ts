/**
 * compare_screenshots MCP tool
 * Compares two screenshots pixel-by-pixel and returns mismatch stats + visual diff image
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { compareImages } from "../utils/image-diff.js";
import { validateSession, isToolResult } from "../utils/tool-helpers.js";

/**
 * Register the compare_screenshots tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerCompareScreenshotsTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "compare_screenshots",
    "Compare two screenshots pixel-by-pixel and return a visual diff image with mismatch statistics. Accepts base64-encoded image data from previous screenshot tool calls. Use for visual regression testing — compare before/after states to detect unintended UI changes.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      image1: z
        .string()
        .describe(
          "Base64-encoded image data (from screenshot_web, screenshot_electron, or other screenshot tool)"
        ),
      image2: z
        .string()
        .describe("Base64-encoded image data to compare against image1"),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          "Pixel matching sensitivity from 0 to 1 (lower = stricter matching). Default: 0.1. Use 0 for exact match, 0.2+ for tolerating anti-aliasing differences."
        ),
    },
    async ({ sessionId, image1, image2, threshold }) => {
      try {
        // Validate session exists
        const session = validateSession(sessionManager, sessionId);
        if (isToolResult(session)) return session;

        // Decode base64 images to Buffer
        let buf1: Buffer;
        let buf2: Buffer;
        try {
          buf1 = Buffer.from(image1, "base64");
          buf2 = Buffer.from(image2, "base64");
        } catch {
          return createToolError(
            "Invalid base64 image data",
            "Could not decode one or both image strings from base64",
            "Ensure image1 and image2 contain valid base64-encoded image data from a screenshot tool."
          );
        }

        // Validate buffers are non-empty
        if (buf1.length === 0 || buf2.length === 0) {
          return createToolError(
            "Empty image data",
            "One or both images decoded to an empty buffer",
            "Ensure image1 and image2 contain valid base64-encoded image data from a screenshot tool."
          );
        }

        // Run pixel comparison
        const result = await compareImages(buf1, buf2, { threshold });

        // Return diff image with mismatch stats
        const diffBase64 = result.diffBuffer.toString("base64");
        return createScreenshotResult(
          {
            mismatchPercentage: Number(result.mismatchPercentage.toFixed(2)),
            mismatchPixels: result.mismatchCount,
            totalPixels: result.totalPixels,
            dimensions: { width: result.width, height: result.height },
            threshold: threshold ?? 0.1,
            match: result.mismatchPercentage < 0.1,
          },
          diffBase64,
          "image/webp"
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Dimension mismatch from compareImages
        if (message.includes("dimensions differ")) {
          return createToolError(
            "Image dimension mismatch",
            message,
            "Both images must have the same dimensions. Use the same viewport size and screenshot settings for both captures."
          );
        }

        // Sharp decode errors
        if (
          message.includes("Input buffer") ||
          message.includes("unsupported image format")
        ) {
          return createToolError(
            "Invalid image format",
            message,
            "Ensure image1 and image2 contain valid image data (WebP, PNG, etc.) from a screenshot tool."
          );
        }

        return createToolError(
          "Failed to compare screenshots",
          message,
          "Ensure both images are valid base64-encoded screenshots from this session."
        );
      }
    }
  );
}
