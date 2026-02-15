/**
 * intercept_network MCP tool
 * Intercept, mock, or block network requests using Playwright's page.route() API
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { getActivePage } from "../interaction/selectors.js";

/**
 * Register the intercept_network tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerInterceptNetworkTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "intercept_network",
    "Intercept, mock, or block network requests. Add route rules to mock API responses with custom status/body, block requests matching URL patterns, or modify request headers. List active routes or remove them when done. URL patterns use glob syntax: **/api/* matches any URL containing /api/.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      action: z
        .enum(["add_route", "remove_route", "remove_all", "list_routes"])
        .describe("Operation to perform"),
      urlPattern: z
        .string()
        .optional()
        .describe(
          "Glob pattern for URL matching (e.g., '**/api/data', '**/*.png'). Required for add_route and remove_route."
        ),
      routeAction: z
        .enum(["mock", "block", "modify_headers"])
        .optional()
        .describe(
          "What to do with matched requests. Required for add_route."
        ),
      mockResponse: z
        .object({
          status: z.number().optional(),
          contentType: z.string().optional(),
          body: z.string().optional(),
          headers: z.record(z.string()).optional(),
        })
        .optional()
        .describe(
          "Response to return for mock action. Defaults to { status: 200, contentType: 'application/json', body: '{}' }."
        ),
      modifyHeaders: z
        .record(z.string())
        .optional()
        .describe(
          "Headers to add/override on requests for modify_headers action."
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
        ),
    },
    async ({
      sessionId,
      action,
      urlPattern,
      routeAction,
      mockResponse,
      modifyHeaders,
      pageIdentifier,
    }) => {
      try {
        // Validate session exists
        const session = sessionManager.get(sessionId);
        if (!session) {
          const availableSessions = sessionManager.list();
          return createToolError(
            `Session not found: ${sessionId}`,
            "The session may have already been ended",
            availableSessions.length > 0
              ? `Available sessions: ${availableSessions.join(", ")}`
              : "Create a session first with create_session."
          );
        }

        // For list_routes, we can look up handlers without needing the page
        if (action === "list_routes") {
          // Still need to resolve the identifier for the Map key
          const pageResult = getActivePage(
            sessionManager,
            sessionId,
            pageIdentifier
          );
          if (!pageResult.success) {
            return createToolError(
              pageResult.error,
              `Session: ${sessionId}`,
              pageResult.availablePages
                ? `Available pages: ${pageResult.availablePages.join(", ")}`
                : undefined
            );
          }
          const handlers = sessionManager.getRouteHandlers(
            sessionId,
            pageResult.identifier!
          );
          return createToolResult({
            action: "list_routes",
            routes: handlers.map((h) => ({
              urlPattern: h.urlPattern,
              routeAction: h.action,
            })),
            count: handlers.length,
          });
        }

        // Validate action-specific required parameters
        if (action === "add_route") {
          if (!urlPattern) {
            return createToolError(
              "urlPattern is required for add_route action",
              `action is 'add_route' but no urlPattern was provided`,
              "Provide a glob pattern like '**/api/data' or '**/*.png'."
            );
          }
          if (!routeAction) {
            return createToolError(
              "routeAction is required for add_route action",
              `action is 'add_route' but no routeAction was provided`,
              "Provide one of: mock, block, modify_headers."
            );
          }
        }

        if (action === "remove_route" && !urlPattern) {
          return createToolError(
            "urlPattern is required for remove_route action",
            `action is 'remove_route' but no urlPattern was provided`,
            "Provide the same glob pattern used when adding the route."
          );
        }

        // Find the active page
        const pageResult = getActivePage(
          sessionManager,
          sessionId,
          pageIdentifier
        );
        if (!pageResult.success) {
          return createToolError(
            pageResult.error,
            `Session: ${sessionId}`,
            pageResult.availablePages
              ? `Available pages: ${pageResult.availablePages.join(", ")}`
              : undefined
          );
        }

        const { page } = pageResult;
        const identifier = pageResult.identifier!;

        switch (action) {
          case "add_route": {
            // Build handler based on routeAction
            let handler: (route: import("playwright").Route) => Promise<void>;

            switch (routeAction!) {
              case "mock":
                handler = async (route) => {
                  await route.fulfill({
                    status: mockResponse?.status ?? 200,
                    contentType:
                      mockResponse?.contentType ?? "application/json",
                    body: mockResponse?.body ?? "{}",
                    headers: mockResponse?.headers,
                  });
                };
                break;

              case "block":
                handler = async (route) => {
                  await route.abort();
                };
                break;

              case "modify_headers":
                handler = async (route) => {
                  const headers = {
                    ...route.request().headers(),
                    ...(modifyHeaders ?? {}),
                  };
                  await route.continue({ headers });
                };
                break;
            }

            await page.route(urlPattern!, handler!);

            sessionManager.addRouteHandler(sessionId, identifier, {
              urlPattern: urlPattern!,
              action: routeAction!,
              handler: handler!,
            });

            return createToolResult({
              action: "add_route",
              urlPattern,
              routeAction,
              active: true,
            });
          }

          case "remove_route": {
            const removed = sessionManager.removeRouteHandler(
              sessionId,
              identifier,
              urlPattern!
            );

            if (removed) {
              await page.unroute(urlPattern!, removed.handler);
              return createToolResult({
                action: "remove_route",
                urlPattern,
                removed: true,
              });
            }

            return createToolResult({
              action: "remove_route",
              urlPattern,
              removed: false,
              message: "No active route found for this pattern",
            });
          }

          case "remove_all": {
            const handlers = sessionManager.clearRouteHandlers(
              sessionId,
              identifier
            );

            for (const h of handlers) {
              await page.unroute(h.urlPattern, h.handler);
            }

            return createToolResult({
              action: "remove_all",
              removedCount: handlers.length,
            });
          }

          default:
            return createToolError(
              `Unknown action: ${action}`,
              "This should not happen",
              "Use one of: add_route, remove_route, remove_all, list_routes"
            );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        return createToolError(
          "Failed to intercept network",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}
