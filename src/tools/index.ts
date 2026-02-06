/**
 * MCP tool registration
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { registerCheckPortTool } from "./check-port.js";
import { registerLaunchWebServerTool } from "./launch-web-server.js";
import { registerLaunchElectronTool } from "./launch-electron.js";
import { registerLaunchWindowsExeTool } from "./launch-windows-exe.js";
import { registerStopProcessTool } from "./stop-process.js";
import { registerScreenshotWebTool } from "./screenshot-web.js";
import { registerScreenshotElectronTool } from "./screenshot-electron.js";
import { registerScreenshotDesktopTool } from "./screenshot-desktop.js";
import { registerGetScreenshotTool } from "./get-screenshot.js";
import { registerClickElementTool } from "./click-element.js";
import { registerTypeTextTool } from "./type-text.js";
import { registerNavigateTool } from "./navigate.js";

/**
 * Register all MCP tools with the server
 */
export function registerTools(
  server: McpServer,
  sessionManager: SessionManager
): void {
  // Tool 1: get_version
  server.tool(
    "get_version",
    "Get server version and capabilities. Use to verify the server is running and responsive.",
    {},
    async () => {
      return createToolResult({
        name: "feedback",
        version: "0.1.0",
        status: "ready",
        capabilities: [
          "process_lifecycle",
          "screenshots",
          "interactions",
          "error_capture",
          "workflows",
        ],
      });
    }
  );

  // Tool 2: create_session
  server.tool(
    "create_session",
    "Create a new session for tracking app resources. Returns a unique session ID used by other tools.",
    {},
    async () => {
      const sessionId = sessionManager.create();
      return createToolResult({
        sessionId,
        created: true,
      });
    }
  );

  // Tool 3: list_sessions
  server.tool(
    "list_sessions",
    "List all active session IDs. Use to find existing sessions or check server state.",
    {},
    async () => {
      const sessions = sessionManager.list();
      return createToolResult({
        sessions,
        count: sessions.length,
      });
    }
  );

  // Tool 4: end_session
  server.tool(
    "end_session",
    "End a session and clean up all its resources. Use when done testing an application.",
    {
      sessionId: z.string().describe("The session ID to end"),
    },
    async ({ sessionId }) => {
      const session = sessionManager.get(sessionId);
      if (!session) {
        const availableSessions = sessionManager.list();
        return createToolError(
          `Session not found: ${sessionId}`,
          "The session may have already been ended or never existed",
          availableSessions.length > 0
            ? `Available sessions: ${availableSessions.join(", ")}`
            : "No active sessions. Create one with create_session first."
        );
      }

      await sessionManager.destroy(sessionId);
      return createToolResult({
        sessionId,
        ended: true,
      });
    }
  );

  // Tool 5: check_port
  registerCheckPortTool(server, sessionManager);

  // Tool 6: launch_web_server
  registerLaunchWebServerTool(server, sessionManager);

  // Tool 7: launch_electron
  registerLaunchElectronTool(server, sessionManager);

  // Tool 8: launch_windows_exe
  registerLaunchWindowsExeTool(server, sessionManager);

  // Tool 9: stop_process
  registerStopProcessTool(server, sessionManager);

  // Tool 10: screenshot_web
  registerScreenshotWebTool(server, sessionManager);

  // Tool 11: screenshot_electron
  registerScreenshotElectronTool(server, sessionManager);

  // Tool 12: screenshot_desktop
  registerScreenshotDesktopTool(server, sessionManager);

  // Tool 13: get_screenshot
  registerGetScreenshotTool(server, sessionManager);

  // Tool 14: click_element
  registerClickElementTool(server, sessionManager);

  // Tool 15: type_text
  registerTypeTextTool(server, sessionManager);

  // Tool 16: navigate
  registerNavigateTool(server, sessionManager);

  console.error("Registered 16 MCP tools");
}
