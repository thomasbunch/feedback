/**
 * launch_tauri MCP tool
 * Launches a Tauri app, connects to its WebView2 via CDP, and enables automation (Windows only)
 */

import path from "path";
import { existsSync } from "fs";
import { z } from "zod";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import waitOn from "wait-on";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { Resource } from "../types/index.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { setupAutoCapture } from "../screenshot/auto-capture.js";
import { attachConsoleCollector } from "../capture/console-collector.js";
import { attachErrorCollector } from "../capture/error-collector.js";
import { attachNetworkCollector } from "../capture/network-collector.js";
import { spawnCrossPlatform, attachProcessListeners } from "../process/launcher.js";
import { killProcessTree } from "../process/cleanup.js";

/**
 * Register the launch_tauri tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerLaunchTauriTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "launch_tauri",
    "Launch a Tauri app and connect to its WebView2 for automation (Windows only). Spawns the binary with CDP enabled, connects Playwright, and enables all interaction/screenshot tools.",
    {
      sessionId: z.string().describe("Session ID to track this app"),
      binaryPath: z
        .string()
        .describe(
          "Path to compiled Tauri application binary (.exe on Windows)"
        ),
      args: z
        .array(z.string())
        .optional()
        .describe("Command-line arguments for the Tauri app"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (defaults to binary's directory)"),
      cdpPort: z
        .number()
        .int()
        .min(1024)
        .max(65535)
        .optional()
        .describe("CDP remote debugging port (default: 9222)"),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(120000)
        .optional()
        .describe("Launch timeout in ms (default: 30000)"),
    },
    async ({ sessionId, binaryPath, args, cwd, cdpPort, timeoutMs }) => {
      // Platform check: Tauri webview automation requires Windows (WebView2 + CDP)
      if (process.platform !== "win32") {
        return createToolError(
          "Tauri webview automation is only supported on Windows",
          "WebView2 uses Chrome DevTools Protocol which is not available on macOS (WKWebView) or Linux (webkit2gtk)",
          "Use screenshot_desktop for visual feedback on non-Windows platforms."
        );
      }

      try {
        // Validate session exists
        const session = sessionManager.get(sessionId);
        if (!session) {
          return createToolError(
            `Session not found: ${sessionId}`,
            "The session may have already been ended or never existed",
            "Create a session first with create_session."
          );
        }

        // Resolve paths
        const resolvedBinaryPath = path.resolve(binaryPath);
        const resolvedCwd = cwd
          ? path.resolve(cwd)
          : path.dirname(resolvedBinaryPath);

        // Validate binary exists
        if (!existsSync(resolvedBinaryPath)) {
          return createToolError(
            `Tauri binary not found: ${resolvedBinaryPath}`,
            "The specified binary path does not exist",
            "Check the path points to a compiled Tauri binary. Tauri build output is typically in src-tauri/target/release/ or src-tauri/target/debug/"
          );
        }

        console.error(
          `[launch_tauri] Launching Tauri: ${resolvedBinaryPath}`
        );

        const port = cdpPort ?? 9222;
        const timeout = timeoutMs ?? 30000;

        // Spawn Tauri binary with CDP enabled via WebView2 env var
        const child = spawnCrossPlatform(resolvedBinaryPath, args ?? [], {
          cwd: resolvedCwd,
          env: {
            ...process.env,
            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
          },
        });
        attachProcessListeners(child, "tauri");

        // Wait for CDP port to become available
        await waitOn({
          resources: [`tcp:localhost:${port}`],
          timeout,
          interval: 500,
          log: false,
        });

        // Connect Playwright via CDP
        const browser: Browser = await chromium.connectOverCDP(
          `http://localhost:${port}`,
          { timeout: 10000 }
        );

        // Wait for webview page to appear (poll with 200ms interval, 10s max)
        const context: BrowserContext = browser.contexts()[0];
        let page: Page | undefined;
        const pageWaitStart = Date.now();
        while (!page && Date.now() - pageWaitStart < 10000) {
          const pages = context.pages();
          if (pages.length > 0) {
            page = pages[0];
          } else {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }

        if (!page) {
          await browser.close().catch(() => {});
          if (child.pid && child.exitCode === null) {
            await killProcessTree(child.pid);
          }
          throw new Error("Tauri webview page did not appear within timeout");
        }

        console.error(`[launch_tauri] WebView2 page detected, app ready`);

        // Store page reference for screenshot/interaction access
        sessionManager.setPageRef(sessionId, "tauri", {
          type: "tauri",
          page,
          browser,
          browserContext: context,
        });

        // Attach auto-capture on navigation events
        const removeAutoCapture = setupAutoCapture(
          page,
          sessionId,
          sessionManager
        );

        // Attach diagnostic collectors
        const consoleCollector = attachConsoleCollector(page);
        const errorCollector = attachErrorCollector(page);
        const networkCollector = attachNetworkCollector(page);

        sessionManager.setConsoleCollector(
          sessionId,
          "tauri",
          consoleCollector
        );
        sessionManager.setErrorCollector(sessionId, "tauri", errorCollector);
        sessionManager.setNetworkCollector(
          sessionId,
          "tauri",
          networkCollector
        );

        // Create cleanup resource
        const resource: Resource = {
          cleanup: async () => {
            console.error("[launch_tauri] Closing Tauri app");
            removeAutoCapture();
            sessionManager.removePageRef(sessionId, "tauri");
            await browser.close().catch(() => {});
            if (child.pid && child.exitCode === null) {
              await killProcessTree(child.pid);
            }
            console.error("[launch_tauri] Tauri app closed");
          },
        };
        sessionManager.addResource(sessionId, resource);

        return createToolResult({
          sessionId,
          type: "tauri",
          status: "ready",
          binaryPath: resolvedBinaryPath,
          cdpPort: port,
          windowTitle: await page.title(),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Failed to launch Tauri app",
          message,
          "Check the binary path points to a valid compiled Tauri application. Tauri webview automation requires Windows with WebView2."
        );
      }
    }
  );
}
