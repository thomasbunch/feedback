/**
 * run_workflow MCP tool
 * Executes multi-step workflows on web or Electron pages with per-step
 * screenshot capture and diagnostic log tracking.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError } from "../utils/errors.js";
import { getActivePage } from "../interaction/selectors.js";
import { executeWorkflow, validateStep } from "../workflow/executor.js";
import type { WorkflowResult } from "../workflow/types.js";
import type { ToolResult } from "../types/index.js";

/**
 * Register the run_workflow tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerRunWorkflowTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "run_workflow",
    "Execute a multi-step workflow on a web or Electron page. Runs actions in sequence, captures screenshot and logs at each step, stops on first error. Use for form filling, navigation flows, or multi-step UI verification.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      steps: z
        .array(
          z.object({
            action: z
              .enum(["click", "type", "navigate", "screenshot", "wait"])
              .describe("Action to perform"),
            selector: z
              .string()
              .optional()
              .describe(
                "Element selector — CSS, text=, role=, testid=, xpath= (required for click, type, wait)"
              ),
            text: z
              .string()
              .optional()
              .describe("Text to type (required for type action)"),
            url: z
              .string()
              .optional()
              .describe("URL to navigate to (required for navigate action)"),
            button: z
              .enum(["left", "right", "middle"])
              .optional()
              .describe("Mouse button for click (default: left)"),
            clickCount: z
              .number()
              .int()
              .min(1)
              .max(3)
              .optional()
              .describe("Click count: 1=single, 2=double, 3=triple"),
            pressSequentially: z
              .boolean()
              .optional()
              .describe(
                "Type one key at a time instead of fill (default: false)"
              ),
            clear: z
              .boolean()
              .optional()
              .describe("Clear field before typing (default: true)"),
            fullPage: z
              .boolean()
              .optional()
              .describe(
                "Capture full scrollable page in screenshot (default: false)"
              ),
            state: z
              .enum(["visible", "hidden", "attached", "detached"])
              .optional()
              .describe("State to wait for (default: visible)"),
            timeout: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe("Step timeout in ms (default: 30000)"),
          })
        )
        .min(1)
        .max(20)
        .describe("Action steps to execute in order (max 20)"),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL or 'electron' to target a specific page. Omit if session has only one page."
        ),
    },
    async ({ sessionId, steps, pageIdentifier }) => {
      try {
        // 1. Validate session exists
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

        // 2. Discover page
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

        const { page, identifier } = pageResult;

        // 3. Validate all steps up front before executing any
        const validationErrors: string[] = [];
        for (let i = 0; i < steps.length; i++) {
          const error = validateStep(steps[i], i);
          if (error) {
            validationErrors.push(error);
          }
        }
        if (validationErrors.length > 0) {
          return createToolError(
            "Workflow validation failed",
            validationErrors.join("; "),
            "Fix the step parameters and retry."
          );
        }

        // 4. Execute workflow
        const result: WorkflowResult = await executeWorkflow({
          page,
          steps,
          sessionManager,
          sessionId,
          pageIdentifier: identifier,
        });

        // 5. Build multi-content response
        const content: ToolResult["content"] = [];

        // Summary header
        content.push({
          type: "text",
          text: JSON.stringify(
            {
              workflow:
                result.failedStep !== undefined ? "stopped" : "complete",
              totalSteps: result.totalSteps,
              completedSteps: result.completedSteps,
              failedAtStep: result.failedStep,
            },
            null,
            2
          ),
        });

        // Per-step text metadata and screenshot images
        for (const r of result.steps) {
          const stepMeta: Record<string, unknown> = {
            step: r.stepIndex,
            action: r.action,
            success: r.success,
            error: r.error,
            consoleLogs: r.consoleDelta.length,
            errors: r.errorDelta.length,
          };

          // Include error details inline when present
          if (r.errorDelta.length > 0) {
            stepMeta.errorDetails = r.errorDelta;
          }

          // Include console errors inline when present
          const consoleErrors = r.consoleDelta.filter(
            (e) => e.level === "error"
          );
          if (consoleErrors.length > 0) {
            stepMeta.consoleErrors = consoleErrors;
          }

          content.push({
            type: "text",
            text: JSON.stringify(stepMeta, null, 2),
          });

          // Add screenshot image if captured
          if (r.screenshotBase64 && r.screenshotMimeType) {
            content.push({
              type: "image",
              data: r.screenshotBase64,
              mimeType: r.screenshotMimeType,
            });
          }
        }

        return {
          content,
          isError: result.failedStep !== undefined,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Workflow execution failed",
          message,
          "Take a screenshot to check current page state."
        );
      }
    }
  );
}
