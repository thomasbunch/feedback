/**
 * MCP tool registration
 */

import { z } from "zod";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));
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
import { registerGetElementStateTool } from "./get-element-state.js";
import { registerWaitForElementTool } from "./wait-for-element.js";
import { registerGetConsoleLogsTool } from "./get-console-logs.js";
import { registerGetErrorsTool } from "./get-errors.js";
import { registerGetNetworkLogsTool } from "./get-network-logs.js";
import { registerGetProcessOutputTool } from "./get-process-output.js";
import { registerRunWorkflowTool } from "./run-workflow.js";
import { registerSelectOptionTool } from "./select-option.js";
import { registerPressKeyTool } from "./press-key.js";
import { registerHoverElementTool } from "./hover-element.js";
import { registerScrollTool } from "./scroll.js";
import { registerGetPageContentTool } from "./get-page-content.js";
import { registerFileUploadTool } from "./file-upload.js";
import { registerEvaluateJavascriptTool } from "./evaluate-javascript.js";
import { registerHandleDialogTool } from "./handle-dialog.js";
import { registerResizeViewportTool } from "./resize-viewport.js";
import { registerWaitForConditionTool } from "./wait-for-condition.js";
import { registerManageStorageTool } from "./manage-storage.js";

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
        version: pkg.version,
        status: "ready",
        capabilities: [
          "process_lifecycle",
          "screenshots",
          "interactions",
          "error_capture",
          "workflows",
          "assertions",
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

  // Tool 17: get_element_state
  registerGetElementStateTool(server, sessionManager);

  // Tool 18: wait_for_element
  registerWaitForElementTool(server, sessionManager);

  // Tool 19: get_console_logs
  registerGetConsoleLogsTool(server, sessionManager);

  // Tool 20: get_errors
  registerGetErrorsTool(server, sessionManager);

  // Tool 21: get_network_logs
  registerGetNetworkLogsTool(server, sessionManager);

  // Tool 22: get_process_output
  registerGetProcessOutputTool(server, sessionManager);

  // Tool 23: run_workflow
  registerRunWorkflowTool(server, sessionManager);

  // Tool 24: select_option
  registerSelectOptionTool(server, sessionManager);

  // Tool 25: press_key
  registerPressKeyTool(server, sessionManager);

  // Tool 26: hover_element
  registerHoverElementTool(server, sessionManager);

  // Tool 27: scroll
  registerScrollTool(server, sessionManager);

  // Tool 28: get_page_content
  registerGetPageContentTool(server, sessionManager);

  // Tool 29: file_upload
  registerFileUploadTool(server, sessionManager);

  // Tool 30: evaluate_javascript
  registerEvaluateJavascriptTool(server, sessionManager);

  // Tool 31: handle_dialog
  registerHandleDialogTool(server, sessionManager);

  // Tool 32: resize_viewport
  registerResizeViewportTool(server, sessionManager);

  // Tool 33: wait_for_condition
  registerWaitForConditionTool(server, sessionManager);

  // Tool 34: manage_storage
  registerManageStorageTool(server, sessionManager);

  // Element screenshots handled via selector parameter on screenshot_web (Tool 10) and screenshot_electron (Tool 11)

  console.error("Registered 34 MCP tools");
}
