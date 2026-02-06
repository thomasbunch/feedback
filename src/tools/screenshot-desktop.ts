/**
 * screenshot_desktop MCP tool
 * Captures a screenshot of a Windows desktop application window by PID
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { captureDesktopWindow } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";

/**
 * Register the screenshot_desktop tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerScreenshotDesktopTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "screenshot_desktop",
    "Capture a screenshot of a Windows desktop application window by PID. Use after launch_windows_exe to see the app.",
    {
      sessionId: z
        .string()
        .describe("Session ID (for resource tracking)"),
      pid: z
        .number()
        .int()
        .positive()
        .describe(
          "Process ID of the target window (from launch_windows_exe result)"
        ),
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
    },
    async ({ sessionId, pid, maxWidth, quality }) => {
      try {
        const session = sessionManager.get(sessionId);
        if (!session) {
          return createToolError(
            `Session not found: ${sessionId}`,
            "The session may have already been ended",
            "Create a session first with create_session."
          );
        }

        console.error(
          `[screenshot_desktop] Capturing window PID ${pid} for session ${sessionId}`
        );

        // Capture raw PNG via node-screenshots
        const rawBuffer = await captureDesktopWindow(pid);

        // Optimize: resize + WebP
        const optimized = await optimizeScreenshot(rawBuffer, {
          maxWidth: maxWidth ?? 1280,
          quality: quality ?? 80,
        });

        const imageBase64 = optimized.data.toString("base64");

        return createScreenshotResult(
          {
            sessionId,
            type: "desktop",
            pid,
            mode: "viewport",
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

        // Provide specific guidance based on error type
        let suggestedFix =
          "Check the PID is correct and the window is visible.";
        if (message.includes("No window found")) {
          suggestedFix =
            "The process may not have a visible window yet. Wait a moment and retry, or check the PID from launch_windows_exe output.";
        } else if (message.includes("minimized")) {
          suggestedFix =
            "The window is minimized. The user needs to restore it before capturing.";
        }

        return createToolError(
          "Failed to capture desktop screenshot",
          message,
          suggestedFix
        );
      }
    }
  );
}
