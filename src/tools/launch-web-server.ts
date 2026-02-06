/**
 * launch_web_server MCP tool (PROC-01)
 * Spawns a dev server process and waits for it to become ready
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
import { detectServerReady } from "../process/monitor.js";
import { createProcessResource } from "../process/cleanup.js";
import { attachProcessCollector } from "../capture/process-collector.js";

/**
 * Register the launch_web_server tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerLaunchWebServerTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "launch_web_server",
    "Launch a web dev server and wait for it to be ready. Use to start npm/vite/webpack dev servers for testing.",
    {
      sessionId: z.string().describe("Session ID to track this process"),
      command: z
        .string()
        .describe("Command to run (e.g., 'npm', 'npx', 'node')"),
      args: z
        .array(z.string())
        .describe("Command arguments (e.g., ['run', 'dev'])"),
      cwd: z.string().describe("Working directory for the project"),
      port: z
        .number()
        .int()
        .min(1)
        .max(65535)
        .describe("Expected port the server will listen on"),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(300000)
        .optional()
        .describe("Readiness timeout in ms (default: 60000)"),
    },
    async ({ sessionId, command, args, cwd, port, timeoutMs }) => {
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
          `[launch_web_server] Launching: ${command} ${args.join(" ")} in ${cwd} on port ${port}`
        );

        // Resolve cwd to absolute path
        const resolvedCwd = path.resolve(cwd);

        // Spawn the process
        const child = spawnCrossPlatform(command, args, { cwd: resolvedCwd });

        // Attach logging listeners
        attachProcessListeners(child, `WebServer:${port}`);

        // Attach process output collector for retrieval
        const processCollector = attachProcessCollector(child);
        sessionManager.setProcessCollector(sessionId, `WebServer:${port}`, processCollector);

        // Register process as a session resource for automatic cleanup
        const resource = createProcessResource(child, "web-server");
        sessionManager.addResource(sessionId, resource);

        // Wait for server readiness
        try {
          await detectServerReady(child, port, timeoutMs ?? 60000);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const processExited = child.exitCode !== null;
          return createToolError(
            "Web server failed to become ready",
            processExited
              ? `Process exited with code ${child.exitCode}. ${message}`
              : message,
            "Check the command and port. The process may have crashed -- check server logs."
          );
        }

        return createToolResult({
          sessionId,
          type: "web-server",
          pid: child.pid,
          port,
          status: "ready",
          command,
          args,
          cwd: resolvedCwd,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Unexpected error launching web server",
          message,
          "Check command, arguments, and working directory are correct."
        );
      }
    }
  );
}
