/**
 * launch_electron MCP tool (PROC-02)
 * Launches an Electron app via Playwright for automation
 */

import path from "path";
import { z } from "zod";
import { _electron as electron } from "playwright";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { Resource } from "../types/index.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { setupAutoCapture } from "../screenshot/auto-capture.js";
import { attachConsoleCollector } from "../capture/console-collector.js";
import { attachErrorCollector } from "../capture/error-collector.js";
import { attachNetworkCollector } from "../capture/network-collector.js";

/**
 * Register the launch_electron tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerLaunchElectronTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "launch_electron",
    "Launch an Electron app via Playwright for automation. Use to start and instrument Electron desktop applications.",
    {
      sessionId: z.string().describe("Session ID to track this app"),
      entryPath: z
        .string()
        .describe(
          "Path to Electron main entry file (e.g., main.js, index.js)"
        ),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (defaults to entry file directory)"),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(120000)
        .optional()
        .describe("Launch timeout in ms (default: 30000)"),
    },
    async ({ sessionId, entryPath, cwd, timeoutMs }) => {
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

        console.error(
          `[launch_electron] Launching Electron: ${entryPath}`
        );

        // Resolve paths
        const resolvedEntryPath = path.resolve(entryPath);
        const resolvedCwd = cwd
          ? path.resolve(cwd)
          : path.dirname(resolvedEntryPath);

        // Launch Electron via Playwright
        const electronApp = await electron.launch({
          args: [resolvedEntryPath],
          cwd: resolvedCwd,
          timeout: timeoutMs ?? 30000,
        });

        // Wait for the first window to appear
        const window = await electronApp.firstWindow();
        console.error(`[launch_electron] Window detected, app ready`);

        // Store page reference for screenshot access
        sessionManager.setPageRef(sessionId, "electron", {
          type: "electron",
          page: window,
          electronApp,
        });

        // Attach auto-capture on navigation events
        const removeAutoCapture = setupAutoCapture(window, sessionId, sessionManager);

        // Attach diagnostic collectors
        const consoleCollector = attachConsoleCollector(window);
        const errorCollector = attachErrorCollector(window);
        const networkCollector = attachNetworkCollector(window);

        sessionManager.setConsoleCollector(sessionId, "electron", consoleCollector);
        sessionManager.setErrorCollector(sessionId, "electron", errorCollector);
        sessionManager.setNetworkCollector(sessionId, "electron", networkCollector);

        // Create a resource that cleans up the Electron app
        const resource: Resource = {
          cleanup: async () => {
            console.error(`[launch_electron] Closing Electron app`);
            removeAutoCapture();
            sessionManager.removePageRef(sessionId, "electron");
            await electronApp.close();
            console.error(`[launch_electron] Electron app closed`);
          },
        };
        sessionManager.addResource(sessionId, resource);

        return createToolResult({
          sessionId,
          type: "electron",
          status: "ready",
          entryPath: resolvedEntryPath,
          windowTitle: await window.title(),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Failed to launch Electron app",
          message,
          "Check the entry path points to a valid Electron main file. Ensure Electron is installed in the target project."
        );
      }
    }
  );
}
