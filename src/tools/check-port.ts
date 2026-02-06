/**
 * check_port MCP tool (PROC-04)
 * Reports whether a TCP port is available and suggests alternatives
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import detect from "detect-port";

/**
 * Register the check_port tool with the MCP server
 */
export function registerCheckPortTool(
  server: McpServer,
  _sessionManager: SessionManager
): void {
  server.tool(
    "check_port",
    "Check if a TCP port is available for use. Use before launching a web server to avoid EADDRINUSE errors.",
    {
      port: z
        .number()
        .int()
        .min(1)
        .max(65535)
        .describe("Port number to check availability for"),
    },
    async ({ port }) => {
      try {
        const availablePort = await detect(port);

        if (availablePort === port) {
          return createToolResult({
            port,
            available: true,
          });
        }

        return createToolResult({
          port,
          available: false,
          suggestedAlternative: availablePort,
          message: `Port ${port} is in use. Port ${availablePort} is available.`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          `Failed to check port ${port}`,
          message,
          "Ensure the port number is valid (1-65535)"
        );
      }
    }
  );
}
