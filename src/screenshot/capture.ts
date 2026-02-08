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
 * Uses tasklist to resolve PID to process name, then node-screenshots
 * to enumerate windows and match by appName.
 * Returns raw PNG buffer for further optimization.
 */
export async function captureDesktopWindow(pid: number): Promise<Buffer> {
  const { execSync } = await import("child_process");
  const { Window } = await import("node-screenshots");

  // Resolve PID to process name via tasklist
  let processName: string;
  try {
    const output = execSync(
      `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
      { encoding: "utf-8" }
    ).trim();

    // tasklist returns "INFO: No tasks are running..." when PID not found
    if (output.includes("INFO:") || !output.startsWith('"')) {
      throw new Error(
        `Could not find process name for PID ${pid}. The process may have exited.`
      );
    }

    // CSV format: "processname.exe","1234","Console","1","12,345 K"
    const match = output.match(/^"([^"]+)"/);
    if (!match) {
      throw new Error(
        `Could not find process name for PID ${pid}. The process may have exited.`
      );
    }

    // Strip .exe suffix for matching against appName
    processName = match[1].replace(/\.exe$/i, "");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Could not find")) {
      throw error;
    }
    throw new Error(
      `Could not find process name for PID ${pid}. The process may have exited.`
    );
  }

  console.error(
    `[captureDesktopWindow] PID ${pid} resolved to process name: ${processName}`
  );

  // Find matching window by appName
  const windows = Window.all();
  const target = windows.find((w) =>
    w.appName.toLowerCase().includes(processName.toLowerCase())
  );

  if (!target) {
    throw new Error(
      `No window found for process "${processName}" (PID ${pid}). ` +
      `The process may not have a visible window yet. ` +
      `Available windows: ${windows.map((w) => w.appName).join(", ")}`
    );
  }

  if (target.isMinimized) {
    throw new Error(
      `Window for "${processName}" (PID ${pid}) is minimized. Restore it before capturing.`
    );
  }

  console.error(
    `[captureDesktopWindow] Capturing window: "${target.appName}" (${target.width}x${target.height})`
  );

  const image = await target.captureImage();
  const pngData = await image.toPng();
  return Buffer.from(pngData);
}
