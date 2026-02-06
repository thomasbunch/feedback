/**
 * launch_windows_exe MCP tool (PROC-03)
 * Spawns a Windows executable and tracks its process as a session resource
 */

import path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import {
  spawnCrossPlatform,
  attachProcessListeners,
} from "../process/launcher.js";
import { createProcessResource } from "../process/cleanup.js";
import { attachProcessCollector } from "../capture/process-collector.js";

/**
 * Register the launch_windows_exe tool with the MCP server
 *
 * Spawns a Windows .exe, waits briefly for immediate spawn errors,
 * and registers the process as a session resource for cleanup.
 */
export function registerLaunchWindowsExeTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "launch_windows_exe",
    "Launch a Windows executable and track its process. Use to start .exe applications for GUI testing.",
    {
      sessionId: z.string().describe("Session ID to track this process"),
      exePath: z.string().describe("Absolute path to the .exe file"),
      args: z
        .array(z.string())
        .optional()
        .describe("Command line arguments for the executable"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (defaults to exe's directory)"),
    },
    async ({ sessionId, exePath, args, cwd }) => {
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
        const resolvedExePath = path.resolve(exePath);
        const resolvedCwd = cwd
          ? path.resolve(cwd)
          : path.dirname(resolvedExePath);

        console.error(
          `[launch_windows_exe] Launching: ${resolvedExePath}`
        );

        // Spawn the process
        const child = spawnCrossPlatform(resolvedExePath, args ?? [], {
          cwd: resolvedCwd,
        });
        attachProcessListeners(
          child,
          `WinExe:${path.basename(resolvedExePath)}`
        );

        // Attach process output collector for retrieval
        const processCollector = attachProcessCollector(child);
        sessionManager.setProcessCollector(sessionId, `WinExe:${path.basename(resolvedExePath)}`, processCollector);

        // Wait briefly for immediate spawn errors
        await new Promise<void>((resolve, reject) => {
          const errorHandler = (err: Error) => reject(err);
          child.on("error", errorHandler);
          setTimeout(() => {
            child.removeListener("error", errorHandler);
            resolve();
          }, 1000);
        });

        // Check if process exited immediately (bad path, missing deps, etc.)
        if (child.exitCode !== null) {
          return createToolError(
            `Process exited immediately with code ${child.exitCode}`,
            `Attempted to launch: ${resolvedExePath}`,
            "Check that the .exe path is correct and the application can run from the command line"
          );
        }

        // Register as session resource for cleanup
        const resource = createProcessResource(child, "windows-exe");
        sessionManager.addResource(sessionId, resource);

        return createToolResult({
          sessionId,
          type: "windows-exe",
          pid: child.pid,
          status: "running",
          exePath: resolvedExePath,
          args: args ?? [],
          cwd: resolvedCwd,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Failed to launch Windows executable",
          message,
          "Check the .exe path is correct and the file exists."
        );
      }
    }
  );
}
