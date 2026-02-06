/**
 * Shared type definitions for diagnostic capture infrastructure
 * Used by all collector modules and SessionManager
 */

/**
 * Generic collector interface — container for captured diagnostic data.
 * Each collector attaches event listeners, stores entries in a bounded array,
 * and provides getEntries() to read and detach() to clean up.
 */
export interface Collector<T> {
  getEntries: () => T[];
  detach: () => void;
}

/**
 * ERRX-01: Console log entry
 * Captured from Playwright page.on("console") events.
 */
export interface ConsoleEntry {
  timestamp: string;
  level: string;
  text: string;
  location?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}

/**
 * ERRX-02: Error/crash entry
 * Captured from page.on("pageerror") and page.on("crash") events.
 */
export interface ErrorEntry {
  timestamp: string;
  type: "uncaught-exception" | "page-crash";
  message: string;
  stack?: string;
}

/**
 * ERRX-04: Network request/response entry
 * Captured from page.on("request"), page.on("response"), page.on("requestfailed").
 */
export interface NetworkEntry {
  timestamp: string;
  method: string;
  url: string;
  resourceType: string;
  status: number;
  statusText: string;
  durationMs?: number;
  errorText?: string;
  fromServiceWorker?: boolean;
}

/**
 * ERRX-03: Process output entry
 * Captured from child process stdout/stderr streams.
 */
export interface ProcessOutputEntry {
  timestamp: string;
  stream: "stdout" | "stderr";
  text: string;
}
