/**
 * manage_tabs MCP tool
 * Lists, switches between, opens, and closes browser tabs/pages
 * Also tracks popup windows automatically via BrowserContext 'page' event
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import {
  createToolError,
  createToolResult,
  createScreenshotResult,
} from "../utils/errors.js";
import { getActivePage } from "../interaction/selectors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";

/**
 * Set up popup tracking on a BrowserContext.
 * Only attaches once per session (idempotent via SessionManager tracking).
 * New pages opened via window.open(), target="_blank", etc. are automatically
 * registered as page references.
 */
function setupPopupTracking(
  sessionManager: SessionManager,
  sessionId: string,
  context: import("playwright").BrowserContext
): void {
  if (sessionManager.hasPopupTracking(sessionId)) return;
  sessionManager.setPopupTracking(sessionId);

  context.on("page", async (newPage) => {
    try {
      await newPage.waitForLoadState("domcontentloaded");
      const url = newPage.url();
      const identifier = url === "about:blank" ? `popup-${Date.now()}` : url;
      sessionManager.setPageRef(sessionId, identifier, {
        type: "web",
        page: newPage,
        url: identifier,
      });
      console.error(
        `Popup tracked: ${identifier} in session ${sessionId}`
      );
    } catch (error) {
      console.error(
        `Failed to track popup in session ${sessionId}:`,
        error
      );
    }
  });
}

/**
 * Register the manage_tabs tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerManageTabsTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "manage_tabs",
    "List, switch between, open, and close browser tabs. Also tracks popup windows automatically. Use to test multi-tab workflows, verify popups, or manage parallel page interactions.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      action: z
        .enum(["list", "switch", "open", "close"])
        .describe("Operation to perform"),
      targetPage: z
        .string()
        .optional()
        .describe(
          "Page identifier (URL) to switch to or close. Required for switch and close."
        ),
      url: z
        .string()
        .optional()
        .describe("URL to open in a new tab. Required for open action."),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL, 'electron', or 'tauri' to target a specific page. Omit if session has only one page."
        ),
    },
    async ({ sessionId, action, targetPage, url, pageIdentifier }) => {
      try {
        // Validate action-specific required parameters
        if ((action === "switch" || action === "close") && !targetPage) {
          return createToolError(
            `targetPage required for ${action} action`,
            `action is '${action}' but no targetPage was provided`,
            "Provide the page identifier (URL) of the tab to target."
          );
        }

        if (action === "open" && !url) {
          return createToolError(
            "url required for open action",
            "action is 'open' but no url was provided",
            "Provide the URL to open in the new tab."
          );
        }

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

        switch (action) {
          case "list":
            return await handleList(sessionManager, sessionId, pageIdentifier);
          case "switch":
            return await handleSwitch(
              sessionManager,
              sessionId,
              targetPage!,
              pageIdentifier
            );
          case "open":
            return await handleOpen(
              sessionManager,
              sessionId,
              url!,
              pageIdentifier
            );
          case "close":
            return await handleClose(
              sessionManager,
              sessionId,
              targetPage!,
              pageIdentifier
            );
          default:
            return createToolError(
              `Unknown action: ${action}`,
              "This should not happen",
              "Use one of: list, switch, open, close"
            );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return createToolError(
          "Failed to manage tabs",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}

/**
 * List all open tabs/pages in the browser context
 */
async function handleList(
  sessionManager: SessionManager,
  sessionId: string,
  pageIdentifier?: string
) {
  const pageResult = getActivePage(sessionManager, sessionId, pageIdentifier);
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
  const context = page.context();

  // Set up popup tracking for future popups
  setupPopupTracking(sessionManager, sessionId, context);

  // Get all pages from the browser context
  const allPages = context.pages();
  const tabs = await Promise.all(
    allPages.map(async (p) => ({
      url: p.url(),
      title: await p.title(),
    }))
  );

  // Also include registered page ref identifiers for this session
  const entries = sessionManager.getPageRefEntries(sessionId);
  const identifiers = entries.map((e) => e.identifier);

  return createToolResult({
    action: "list",
    tabs,
    identifiers,
    count: allPages.length,
  });
}

/**
 * Switch to a different tab (bring to front) and capture screenshot
 */
async function handleSwitch(
  sessionManager: SessionManager,
  sessionId: string,
  targetPageId: string,
  pageIdentifier?: string
) {
  // Try to find the target page via page ref first
  const targetRef = sessionManager.getPageRef(sessionId, targetPageId);

  if (targetRef) {
    const targetPage = targetRef.page;

    // Set up popup tracking
    const context = targetPage.context();
    setupPopupTracking(sessionManager, sessionId, context);

    await targetPage.bringToFront();
    await targetPage.waitForLoadState("domcontentloaded").catch(() => {});

    // Capture screenshot
    const rawBuffer = await capturePlaywrightPage(targetPage, {
      fullPage: false,
    });
    const optimized = await optimizeScreenshot(rawBuffer, {
      maxWidth: 1280,
      quality: 80,
    });
    const imageBase64 = optimized.data.toString("base64");

    return createScreenshotResult(
      {
        sessionId,
        action: "switch_tab",
        targetPage: targetPageId,
        success: true,
      },
      imageBase64,
      optimized.mimeType
    );
  }

  // Fallback: find by URL matching across context pages
  const anyPageResult = getActivePage(
    sessionManager,
    sessionId,
    pageIdentifier
  );
  if (!anyPageResult.success) {
    return createToolError(
      anyPageResult.error,
      `Session: ${sessionId}`,
      anyPageResult.availablePages
        ? `Available pages: ${anyPageResult.availablePages.join(", ")}`
        : undefined
    );
  }

  const context = anyPageResult.page.context();
  setupPopupTracking(sessionManager, sessionId, context);

  const allPages = context.pages();
  const matchedPage = allPages.find((p) => p.url().includes(targetPageId));

  if (!matchedPage) {
    const entries = sessionManager.getPageRefEntries(sessionId);
    const available = entries.map((e) => e.identifier);
    return createToolError(
      `Page not found: ${targetPageId}`,
      `No page matching "${targetPageId}" found in context`,
      available.length > 0
        ? `Available pages: ${available.join(", ")}`
        : "Use manage_tabs with action 'list' to see available pages."
    );
  }

  await matchedPage.bringToFront();
  await matchedPage.waitForLoadState("domcontentloaded").catch(() => {});

  const rawBuffer = await capturePlaywrightPage(matchedPage, {
    fullPage: false,
  });
  const optimized = await optimizeScreenshot(rawBuffer, {
    maxWidth: 1280,
    quality: 80,
  });
  const imageBase64 = optimized.data.toString("base64");

  return createScreenshotResult(
    {
      sessionId,
      action: "switch_tab",
      targetPage: targetPageId,
      success: true,
    },
    imageBase64,
    optimized.mimeType
  );
}

/**
 * Open a new tab with a specified URL
 */
async function handleOpen(
  sessionManager: SessionManager,
  sessionId: string,
  url: string,
  pageIdentifier?: string
) {
  // Find any existing page to get the BrowserContext
  const pageResult = getActivePage(sessionManager, sessionId, pageIdentifier);
  if (!pageResult.success) {
    return createToolError(
      pageResult.error,
      `Session: ${sessionId}`,
      pageResult.availablePages
        ? `Available pages: ${pageResult.availablePages.join(", ")}`
        : undefined
    );
  }

  const context = pageResult.page.context();
  setupPopupTracking(sessionManager, sessionId, context);

  // Create new page and navigate
  const newPage = await context.newPage();
  await newPage.goto(url, { waitUntil: "domcontentloaded" });
  const finalUrl = newPage.url();

  // Register the new page reference
  sessionManager.setPageRef(sessionId, finalUrl, {
    type: "web",
    page: newPage,
    url: finalUrl,
  });

  // Capture screenshot of the new page
  const rawBuffer = await capturePlaywrightPage(newPage, {
    fullPage: false,
  });
  const optimized = await optimizeScreenshot(rawBuffer, {
    maxWidth: 1280,
    quality: 80,
  });
  const imageBase64 = optimized.data.toString("base64");

  return createScreenshotResult(
    {
      sessionId,
      action: "open_tab",
      url: finalUrl,
      success: true,
    },
    imageBase64,
    optimized.mimeType
  );
}

/**
 * Close a tab by its identifier
 */
async function handleClose(
  sessionManager: SessionManager,
  sessionId: string,
  targetPageId: string,
  pageIdentifier?: string
) {
  const targetRef = sessionManager.getPageRef(sessionId, targetPageId);

  if (!targetRef) {
    const entries = sessionManager.getPageRefEntries(sessionId);
    const available = entries.map((e) => e.identifier);
    return createToolError(
      `Page not found: ${targetPageId}`,
      `No page reference found for "${targetPageId}"`,
      available.length > 0
        ? `Available pages: ${available.join(", ")}`
        : "Use manage_tabs with action 'list' to see available pages."
    );
  }

  // Prevent closing the last tab
  const context = targetRef.page.context();
  const allPages = context.pages();
  if (allPages.length <= 1) {
    return createToolError(
      "Cannot close the last tab",
      "Closing the last tab would leave the session with no pages",
      "Use end_session to close the session instead."
    );
  }

  await targetRef.page.close();
  sessionManager.removePageRef(sessionId, targetPageId);

  return createToolResult({
    action: "close_tab",
    targetPage: targetPageId,
    closed: true,
  });
}
