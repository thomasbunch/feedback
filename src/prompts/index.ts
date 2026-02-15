/**
 * MCP prompt registration
 * Provides pre-built QA workflow templates as MCP prompts.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register all MCP prompts with the server.
 * Provides 3 QA scenario templates: smoke-test, accessibility-check, responsive-check.
 */
export function registerPrompts(server: McpServer): void {
  // Prompt 1: Smoke test workflow
  server.prompt(
    "smoke-test",
    "Guide Claude through a smoke test: launch app, take screenshots, check for errors",
    { url: z.string().describe("URL of the running web application") },
    async ({ url }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Perform a smoke test on ${url}:`,
              "",
              "1. create_session to start tracking",
              `2. screenshot_web to capture the initial page load at ${url}`,
              "3. get_console_logs to check for warnings or errors",
              "4. get_errors to check for uncaught exceptions",
              "5. Click through main navigation elements",
              "6. Take a screenshot after each navigation",
              "7. Summarize: pages tested, errors found, overall health",
              "",
              "Report any issues with specific error messages and screenshots.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // Prompt 2: Accessibility audit workflow
  server.prompt(
    "accessibility-check",
    "Guide Claude through an accessibility audit using axe-core and the accessibility tree",
    { url: z.string().describe("URL of the page to audit") },
    async ({ url }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Perform an accessibility audit on ${url}:`,
              "",
              "1. create_session to start tracking",
              `2. screenshot_web to capture the page at ${url}`,
              "3. audit_accessibility to run axe-core analysis",
              "4. get_accessibility_tree to inspect the page structure",
              "5. Describe each violation with its impact level, affected elements, and suggested fixes",
              "6. Check keyboard navigation by simulating Tab key presses through interactive elements",
              "7. Summarize findings grouped by severity (critical, serious, moderate, minor)",
              "",
              "Focus on WCAG 2.1 AA compliance.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // Prompt 3: Responsive design testing workflow
  server.prompt(
    "responsive-check",
    "Guide Claude through responsive design testing at multiple viewport sizes",
    { url: z.string().describe("URL of the page to test") },
    async ({ url }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Perform responsive design testing on ${url}:`,
              "",
              "1. create_session to start tracking",
              `2. Navigate to ${url}`,
              "3. Test at each of these 4 viewport sizes:",
              "   - Mobile: 375x667",
              "   - Tablet: 768x1024",
              "   - Desktop: 1280x720",
              "   - Wide: 1920x1080",
              "4. For each viewport size:",
              "   a. resize_viewport to set the dimensions",
              "   b. screenshot_web with fullPage: true to capture the layout",
              "   c. Check for horizontal overflow or clipping",
              "   d. Verify navigation elements are accessible",
              "5. Compare layouts across sizes and report breakpoint issues",
              "",
              "Flag any elements that overflow, overlap, or become inaccessible at specific sizes.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  console.error("Registered 3 MCP prompts");
}
