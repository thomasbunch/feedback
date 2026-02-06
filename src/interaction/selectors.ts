/**
 * Selector resolution and page discovery
 * Converts string selectors to Playwright Locators and discovers active pages
 */

import type { Page, Locator } from "playwright";
import type { SessionManager } from "../session-manager.js";
import type { PageDiscoveryResult } from "./types.js";

/**
 * Convert a selector string to a Playwright Locator.
 *
 * Supported formats:
 * - CSS selectors: #id, .class, div > span (passed directly to Playwright)
 * - Text: text=Click me (Playwright native)
 * - Role: role=button[name='Submit'] (Playwright native)
 * - XPath: xpath=//div[@id='main'] (Playwright native)
 * - Test ID: testid=my-btn (resolved via getByTestId)
 */
export function resolveSelector(page: Page, selector: string): Locator {
  // testid= is the one prefix Playwright doesn't handle natively
  if (selector.startsWith("testid=")) {
    const testId = selector.slice("testid=".length);
    return page.getByTestId(testId);
  }

  // All other selectors: CSS, text=, role=, xpath= — Playwright handles natively
  return page.locator(selector);
}

/**
 * Find the active page for interaction in a session.
 *
 * - If pageIdentifier is provided, looks up that specific page
 * - If omitted and session has exactly one page, auto-selects it
 * - If omitted and session has 0 or >1 pages, returns actionable error
 */
export function getActivePage(
  sessionManager: SessionManager,
  sessionId: string,
  pageIdentifier?: string
): PageDiscoveryResult {
  // Validate session exists
  const session = sessionManager.get(sessionId);
  if (!session) {
    return {
      success: false,
      error: `Session not found: ${sessionId}`,
    };
  }

  if (pageIdentifier) {
    // Look up specific page by identifier
    const ref = sessionManager.getPageRef(sessionId, pageIdentifier);
    if (!ref) {
      const refs = sessionManager.getPageRefs(sessionId);
      const available = refs.map((r) =>
        r.type === "electron" ? "electron" : r.url ?? "unknown"
      );
      return {
        success: false,
        error: `Page not found: ${pageIdentifier}`,
        availablePages: available.length > 0 ? available : undefined,
      };
    }
    return {
      success: true,
      page: ref.page,
      identifier: pageIdentifier,
      type: ref.type,
    };
  }

  // Auto-discover: no pageIdentifier provided
  const refs = sessionManager.getPageRefs(sessionId);

  if (refs.length === 0) {
    return {
      success: false,
      error:
        "No pages available in this session. Launch an app first with launch_web_server, launch_electron, or screenshot_web.",
    };
  }

  if (refs.length === 1) {
    const ref = refs[0];
    const identifier =
      ref.type === "electron" ? "electron" : ref.url ?? "unknown";
    return {
      success: true,
      page: ref.page,
      identifier,
      type: ref.type,
    };
  }

  // Multiple pages — require explicit selection
  const available = refs.map((r) =>
    r.type === "electron" ? "electron" : r.url ?? "unknown"
  );
  return {
    success: false,
    error: `Multiple pages found (${refs.length}). Specify pageIdentifier to target a specific page.`,
    availablePages: available,
  };
}
