/**
 * Shared utility functions for tool boilerplate elimination
 * Consolidates the most-duplicated patterns across tool files into reusable helpers.
 */

import type { Page } from "playwright";
import type { SessionManager } from "../session-manager.js";
import type { ToolResult, Session } from "../types/index.js";
import { createToolError } from "./errors.js";
import { getActivePage } from "../interaction/selectors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";

/**
 * Default screenshot optimization settings used across tools
 */
export const SCREENSHOT_DEFAULTS = {
  maxWidth: 1280,
  quality: 80,
} as const;

/**
 * Type guard to distinguish ToolResult from other return types (e.g. Session).
 * ToolResult has a `content` array; Session has `id`, `createdAt`, `resources`.
 */
export function isToolResult(value: unknown): value is ToolResult {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }
  return "content" in value && Array.isArray((value as ToolResult).content);
}

/**
 * Validate that a session exists, returning the Session or a ToolResult error.
 *
 * Replaces the 8-line pattern:
 *   const session = sessionManager.get(sessionId);
 *   if (!session) { return createToolError(...); }
 *
 * @returns Session if found, or ToolResult error if not
 */
export function validateSession(
  sessionManager: SessionManager,
  sessionId: string
): Session | ToolResult {
  const session = sessionManager.get(sessionId);
  if (session) {
    return session;
  }

  const availableSessions = sessionManager.list();
  return createToolError(
    `Session not found: ${sessionId}`,
    "The session may have already been ended or never existed",
    availableSessions.length > 0
      ? `Available sessions: ${availableSessions.join(", ")}`
      : "Create a session first with create_session."
  );
}

/**
 * Resolve the active page for a session, returning page info or a ToolResult error.
 *
 * Replaces the 10-line pattern:
 *   const pageResult = getActivePage(sessionManager, sessionId, pageIdentifier);
 *   if (!pageResult.success) { return createToolError(...); }
 *
 * @returns { page, identifier, type } on success, or ToolResult error on failure
 */
export function resolvePageOrError(
  sessionManager: SessionManager,
  sessionId: string,
  pageIdentifier?: string
): { page: Page; identifier: string; type: "web" | "electron" | "tauri" } | ToolResult {
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

  return {
    page: pageResult.page,
    identifier: pageResult.identifier,
    type: pageResult.type,
  };
}

/**
 * Capture a Playwright page screenshot and optimize it for MCP transport.
 *
 * Replaces the 6-line capture+optimize+base64 pattern used in most tools.
 *
 * @returns { imageBase64, mimeType, width, height }
 */
export async function captureAndOptimize(
  page: Page,
  opts?: { maxWidth?: number; quality?: number; fullPage?: boolean }
): Promise<{ imageBase64: string; mimeType: string; width: number; height: number }> {
  const fullPage = opts?.fullPage ?? false;
  const maxWidth = opts?.maxWidth ?? SCREENSHOT_DEFAULTS.maxWidth;
  const quality = opts?.quality ?? SCREENSHOT_DEFAULTS.quality;

  const rawBuffer = await capturePlaywrightPage(page, { fullPage });
  const optimized = await optimizeScreenshot(rawBuffer, { maxWidth, quality });

  return {
    imageBase64: optimized.data.toString("base64"),
    mimeType: optimized.mimeType,
    width: optimized.width,
    height: optimized.height,
  };
}

/**
 * Convert selector-related errors into structured ToolResult errors.
 *
 * Handles three categories:
 * 1. Strict mode violations (selector matched multiple elements)
 * 2. Timeouts (element not found within timeout)
 * 3. Generic failures (all other errors)
 *
 * @param error - The caught error (Error instance or string)
 * @param context - Selector, optional timeout, and action name
 * @returns ToolResult with isError: true
 */
export function handleSelectorError(
  error: unknown,
  context: { selector: string; timeout?: number; actionName: string }
): ToolResult {
  const message = error instanceof Error ? error.message : String(error);

  // Strict mode violation: selector matched multiple elements
  if (message.includes("strict mode violation")) {
    return createToolError(
      "Selector matched multiple elements",
      `Selector "${context.selector}" matched more than one element (strict mode violation)`,
      "Use a more specific selector or add :nth-child(), :first-of-type, or similar to target a single element."
    );
  }

  // Timeout: element not found or not actionable within timeout
  if (message.includes("Timeout") || message.includes("timeout")) {
    return createToolError(
      "Element not found within timeout",
      `Selector "${context.selector}" did not match any visible element within ${context.timeout ?? 30000}ms`,
      "Check the selector is correct, the element is visible, or increase the timeout. Take a screenshot first to verify the page state."
    );
  }

  // Default error
  return createToolError(
    `Failed to ${context.actionName}`,
    `Selector: "${context.selector}" — ${message}`,
    "Take a screenshot to verify the element exists and is visible on the page."
  );
}
