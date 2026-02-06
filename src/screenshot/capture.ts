/**
 * Core screenshot capture functions
 * Playwright pages (web/Electron) and Windows desktop windows
 */

import type { Page } from "playwright";

/**
 * Capture a screenshot from a Playwright Page (web or Electron)
 * Returns raw PNG buffer for further optimization
 */
export async function capturePlaywrightPage(
  page: Page,
  options?: { fullPage?: boolean }
): Promise<Buffer> {
  return await page.screenshot({
    fullPage: options?.fullPage ?? false,
    type: "png",
  });
}

/**
 * Capture a screenshot of a Windows desktop window by PID.
 * Uses node-screenshots to enumerate windows and match by process ID.
 * Returns raw PNG buffer for further optimization.
 *
 * Note: node-screenshots Window objects may not expose PID in all versions.
 * Falls back to matching by window title if PID is unavailable.
 */
export async function captureDesktopWindow(pid: number): Promise<Buffer> {
  // Dynamic import to avoid load-time failures on non-Windows
  const { Window } = await import("node-screenshots");

  const windows = Window.all();

  // node-screenshots Window type doesn't expose pid in current typings,
  // but some builds include it at runtime. Use any cast for defensive check.
  const target = windows.find((w) => {
    const wAny = w as any;
    if (typeof wAny.processId === "number") return wAny.processId === pid;
    if (typeof wAny.pid === "number") return wAny.pid === pid;
    if (typeof wAny.pid === "function") return wAny.pid() === pid;
    return false;
  });

  if (!target) {
    throw new Error(
      `No window found for PID ${pid}. The process may not have a visible window yet.`
    );
  }

  if (target.isMinimized) {
    throw new Error(
      `Window for PID ${pid} is minimized. Restore it before capturing.`
    );
  }

  const image = await target.captureImage();
  const pngData = await image.toPng();
  return Buffer.from(pngData);
}
