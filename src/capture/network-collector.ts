/**
 * ERRX-04: HTTP request/response logging
 * Attaches to Playwright page request/response/requestfailed events.
 * Tracks timing via Date.now() delta. Does NOT capture bodies or headers.
 */

import type { Page, Request, Response } from "playwright";
import { Collector, NetworkEntry } from "./types.js";

/**
 * Attach a network request/response collector to a Playwright page.
 * Tracks request timing, status codes, and failed requests.
 *
 * @param page - Playwright Page to monitor
 * @param maxEntries - Maximum entries to buffer (oldest dropped when full)
 * @returns Collector with getEntries() and detach()
 */
export function attachNetworkCollector(page: Page, maxEntries = 500): Collector<NetworkEntry> {
  const entries: NetworkEntry[] = [];
  const pendingRequests = new Map<string, number>();

  /**
   * Composite key for matching requests to responses.
   * Uses method + URL to handle concurrent requests to different endpoints.
   */
  const requestKey = (request: Request): string =>
    `${request.method()} ${request.url()}`;

  const requestHandler = (request: Request): void => {
    pendingRequests.set(requestKey(request), Date.now());
  };

  const responseHandler = (response: Response): void => {
    const request = response.request();
    const key = requestKey(request);
    const startTime = pendingRequests.get(key);
    pendingRequests.delete(key);

    const entry: NetworkEntry = {
      timestamp: new Date().toISOString(),
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      status: response.status(),
      statusText: response.statusText(),
      durationMs: startTime !== undefined ? Date.now() - startTime : undefined,
      fromServiceWorker: response.fromServiceWorker(),
    };

    if (entries.length >= maxEntries) {
      entries.shift();
    }
    entries.push(entry);
  };

  const failedHandler = (request: Request): void => {
    const key = requestKey(request);
    const startTime = pendingRequests.get(key);
    pendingRequests.delete(key);

    const failure = request.failure();
    const entry: NetworkEntry = {
      timestamp: new Date().toISOString(),
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      status: 0,
      statusText: "FAILED",
      durationMs: startTime !== undefined ? Date.now() - startTime : undefined,
      errorText: failure?.errorText,
    };

    if (entries.length >= maxEntries) {
      entries.shift();
    }
    entries.push(entry);
  };

  page.on("request", requestHandler);
  page.on("response", responseHandler);
  page.on("requestfailed", failedHandler);

  return {
    getEntries: () => [...entries],
    detach: () => {
      page.off("request", requestHandler);
      page.off("response", responseHandler);
      page.off("requestfailed", failedHandler);
    },
  };
}
