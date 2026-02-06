/**
 * screenshot_web MCP tool
 * Captures a screenshot of a web page by URL with lazy browser creation
 */

import { z } from "zod";
import { chromium } from "playwright";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createScreenshotResult } from "../utils/errors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { setupAutoCapture } from "../screenshot/auto-capture.js";

/**
 * Register the screenshot_web tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerScreenshotWebTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "screenshot_web",
    "Capture a screenshot of a web page by URL. Creates a browser automatically on first use. Use to see visual state of web apps.",
    {
      sessionId: z
        .string()
        .describe("Session ID to associate the browser with"),
      url: z
        .string()
        .url()
        .describe("URL to screenshot (e.g., http://localhost:3000)"),
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
    },
    async ({ sessionId, url, fullPage, maxWidth, quality }) => {
      try {
        const session = sessionManager.get(sessionId);
        if (!session) {
          return createToolError(
            `Session not found: ${sessionId}`,
            "The session may have already been ended",
            "Create a session first with create_session."
          );
        }

        // Check for existing page reference for this URL
        let pageRef = sessionManager.getPageRef(sessionId, url);

        if (!pageRef) {
          // Lazy browser creation: first screenshot of this URL
          console.error(
            `[screenshot_web] Creating browser for ${url} in session ${sessionId}`
          );

          const browser = await chromium.launch({ headless: true });
          const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
          });
          const page = await context.newPage();

          await page.goto(url, { waitUntil: "load", timeout: 30000 });

          // Store page reference for reuse
          pageRef = {
            type: "web",
            page,
            browser,
            browserContext: context,
            url,
          };
          sessionManager.setPageRef(sessionId, url, pageRef);

          // Attach auto-capture on navigation
          setupAutoCapture(page, sessionId, sessionManager);

          // Register browser cleanup as a session resource
          sessionManager.addResource(sessionId, {
            cleanup: async () => {
              console.error(
                `[screenshot_web] Closing browser for ${url}`
              );
              await context.close().catch(() => {});
              await browser.close().catch(() => {});
            },
          });

          console.error(`[screenshot_web] Browser ready for ${url}`);
        } else {
          // Reuse existing page — navigate if URL changed
          const currentUrl = pageRef.page.url();
          if (currentUrl !== url) {
            await pageRef.page.goto(url, {
              waitUntil: "load",
              timeout: 30000,
            });
          }
        }

        console.error(
          `[screenshot_web] Capturing ${url} for session ${sessionId}`
        );

        // Capture raw PNG
        const rawBuffer = await capturePlaywrightPage(pageRef.page, {
          fullPage: fullPage ?? false,
        });

        // Optimize: resize + WebP
        const optimized = await optimizeScreenshot(rawBuffer, {
          maxWidth: maxWidth ?? 1280,
          quality: quality ?? 80,
        });

        const imageBase64 = optimized.data.toString("base64");

        return createScreenshotResult(
          {
            sessionId,
            type: "web",
            url,
            mode: fullPage ? "full-page" : "viewport",
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
          "Failed to capture web screenshot",
          message,
          "Check the URL is accessible. For dev servers, ensure the server is running first (use launch_web_server)."
        );
      }
    }
  );
}
