/**
 * audit_accessibility MCP tool
 * Runs axe-core WCAG accessibility audits on the page and returns structured violations
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { getActivePage } from "../interaction/selectors.js";
import { AxeBuilder } from "@axe-core/playwright";

/**
 * Register the audit_accessibility tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerAuditAccessibilityTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "audit_accessibility",
    "Run an axe-core WCAG accessibility audit on the page. Returns a structured list of violations with severity (critical/serious/moderate/minor), affected elements, CSS selectors, and remediation guidance. Use to verify pages meet accessibility standards.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL or 'electron' to target a specific page. Omit if session has only one page."
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe(
          "WCAG standard tags to filter audit (e.g., ['wcag2a', 'wcag2aa', 'wcag21aa']). Omit for all rules."
        ),
      include: z
        .string()
        .optional()
        .describe("CSS selector to scope audit to a specific page section"),
      exclude: z
        .string()
        .optional()
        .describe("CSS selector to exclude elements from audit"),
    },
    async ({ sessionId, pageIdentifier, tags, include, exclude }) => {
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

        // Build the axe-core audit
        const builder = new AxeBuilder({ page });

        if (tags) {
          builder.withTags(tags);
        }
        if (include) {
          builder.include(include);
        }
        if (exclude) {
          builder.exclude(exclude);
        }

        // Run the accessibility analysis
        const results = await builder.analyze();

        // Return structured result
        return createToolResult({
          url: results.url,
          timestamp: results.timestamp,
          violationCount: results.violations.length,
          violations: results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            tags: v.tags,
            affectedElements: v.nodes.map((n) => ({
              html: n.html,
              target: n.target,
              impact: n.impact,
              failureSummary: [...n.any, ...n.all, ...n.none]
                .filter((c) => c.message)
                .map((c) => c.message)
                .join("; "),
            })),
          })),
          summary: {
            violations: results.violations.length,
            passes: results.passes.length,
            incomplete: results.incomplete.length,
            inapplicable: results.inapplicable.length,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // axe-core injection failures
        if (
          message.includes("axe") ||
          message.includes("inject") ||
          message.includes("frame")
        ) {
          return createToolError(
            "Accessibility audit failed",
            message,
            "Ensure the page is fully loaded. Take a screenshot first to verify the page state."
          );
        }

        // Page not loaded errors
        if (
          message.includes("Page") ||
          message.includes("Target closed") ||
          message.includes("navigating")
        ) {
          return createToolError(
            "Page not available for audit",
            message,
            "Ensure the page is loaded and not navigating. Take a screenshot to verify."
          );
        }

        // Default error
        return createToolError(
          "Failed to run accessibility audit",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}
