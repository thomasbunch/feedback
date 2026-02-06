/**
 * ERRX-01: Browser console log capture
 * Attaches to Playwright page.on("console") events and stores entries
 * in a bounded array. Uses msg.text() (never jsonValue) for reliability.
 */

import type { Page, ConsoleMessage } from "playwright";
import { Collector, ConsoleEntry } from "./types.js";

/**
 * Attach a console log collector to a Playwright page.
 * Captures all console.log/warn/error/info/debug messages.
 *
 * @param page - Playwright Page to monitor
 * @param maxEntries - Maximum entries to buffer (oldest dropped when full)
 * @returns Collector with getEntries() and detach()
 */
export function attachConsoleCollector(page: Page, maxEntries = 1000): Collector<ConsoleEntry> {
  const entries: ConsoleEntry[] = [];

  const handler = (msg: ConsoleMessage): void => {
    const location = msg.location();
    const entry: ConsoleEntry = {
      timestamp: new Date().toISOString(),
      level: msg.type(),
      text: msg.text(),
    };

    // Only include location if it has a meaningful URL
    if (location && location.url) {
      entry.location = {
        url: location.url,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      };
    }

    if (entries.length >= maxEntries) {
      entries.shift();
    }
    entries.push(entry);
  };

  page.on("console", handler);

  return {
    getEntries: () => [...entries],
    detach: () => {
      page.off("console", handler);
    },
  };
}
