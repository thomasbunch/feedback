/**
 * Auto-capture module
 * Listens for Playwright page navigation events and captures screenshots automatically
 */

import type { Page, Frame } from "playwright";
import type { SessionManager } from "../session-manager.js";
import { optimizeScreenshot } from "./optimize.js";

/**
 * Attach auto-capture listener to a Playwright page.
 * Captures a screenshot after every main-frame navigation.
 * Stores the optimized screenshot in the session manager.
 *
 * @returns Cleanup function to remove the listener
 */
export function setupAutoCapture(
  page: Page,
  sessionId: string,
  sessionManager: SessionManager
): () => void {
  const handler = async (frame: Frame) => {
    if (frame !== page.mainFrame()) return;

    try {
      await page.waitForLoadState("load");
      const rawBuffer = await page.screenshot({ type: "png" });
      const optimized = await optimizeScreenshot(rawBuffer);

      sessionManager.setAutoCapture(sessionId, {
        imageBase64: optimized.data.toString("base64"),
        mimeType: optimized.mimeType,
        url: page.url(),
        capturedAt: new Date(),
      });

      console.error(
        `[auto-capture] Captured ${optimized.width}x${optimized.height} ` +
        `(${optimized.data.length} bytes) for session ${sessionId}`
      );
    } catch (error) {
      console.error(`[auto-capture] Failed for session ${sessionId}:`, error);
    }
  };

  page.on("framenavigated", handler);

  return () => {
    page.off("framenavigated", handler);
  };
}
