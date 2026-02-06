/**
 * ERRX-02: Uncaught exception and page crash capture
 * Attaches to Playwright page.on("pageerror") and page.on("crash") events.
 */

import type { Page } from "playwright";
import { Collector, ErrorEntry } from "./types.js";

/**
 * Attach an error/crash collector to a Playwright page.
 * Captures uncaught exceptions (with stack traces) and page crashes.
 *
 * @param page - Playwright Page to monitor
 * @param maxEntries - Maximum entries to buffer (oldest dropped when full)
 * @returns Collector with getEntries() and detach()
 */
export function attachErrorCollector(page: Page, maxEntries = 100): Collector<ErrorEntry> {
  const entries: ErrorEntry[] = [];

  const errorHandler = (error: Error): void => {
    const entry: ErrorEntry = {
      timestamp: new Date().toISOString(),
      type: "uncaught-exception",
      message: error.message,
      stack: error.stack,
    };

    if (entries.length >= maxEntries) {
      entries.shift();
    }
    entries.push(entry);
  };

  const crashHandler = (): void => {
    const entry: ErrorEntry = {
      timestamp: new Date().toISOString(),
      type: "page-crash",
      message: "Page crashed (possible out of memory)",
    };

    if (entries.length >= maxEntries) {
      entries.shift();
    }
    entries.push(entry);
  };

  page.on("pageerror", errorHandler);
  page.on("crash", crashHandler);

  return {
    getEntries: () => [...entries],
    detach: () => {
      page.off("pageerror", errorHandler);
      page.off("crash", crashHandler);
    },
  };
}
