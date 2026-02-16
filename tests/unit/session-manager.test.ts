/**
 * Unit tests for SessionManager.destroy() Map iteration safety (BUG-3 regression)
 * Verifies collect-then-delete pattern cleanly removes all entries
 * even for multi-page sessions.
 */
import { describe, it, expect } from "vitest";
import { SessionManager } from "../../src/session-manager.js";
import type { PageReference } from "../../src/screenshot/types.js";
import type { Collector, ConsoleEntry, ErrorEntry, NetworkEntry } from "../../src/capture/types.js";

/** Create a mock PageReference with no real browser/context */
function mockPageRef(url: string): PageReference {
  return {
    type: "web",
    page: {} as any,
    url,
  };
}

/** Create a mock Collector that tracks detach calls */
function mockCollector<T>(): Collector<T> & { detached: boolean } {
  const mock = {
    detached: false,
    getEntries: () => [],
    detach: () => { mock.detached = true; },
  };
  return mock;
}

describe("SessionManager.destroy()", () => {
  it("cleans up all page refs when session has multiple pages", async () => {
    const sm = new SessionManager();
    const sessionId = sm.create();

    // Add multiple page refs
    sm.setPageRef(sessionId, "http://page1.test", mockPageRef("http://page1.test"));
    sm.setPageRef(sessionId, "http://page2.test", mockPageRef("http://page2.test"));
    sm.setPageRef(sessionId, "http://page3.test", mockPageRef("http://page3.test"));

    // Verify all refs exist
    expect(sm.getPageRef(sessionId, "http://page1.test")).toBeDefined();
    expect(sm.getPageRef(sessionId, "http://page2.test")).toBeDefined();
    expect(sm.getPageRef(sessionId, "http://page3.test")).toBeDefined();

    // Destroy session
    await sm.destroy(sessionId);

    // Verify ALL refs removed
    expect(sm.getPageRef(sessionId, "http://page1.test")).toBeUndefined();
    expect(sm.getPageRef(sessionId, "http://page2.test")).toBeUndefined();
    expect(sm.getPageRef(sessionId, "http://page3.test")).toBeUndefined();
  });

  it("detaches all collectors when session has multiple pages", async () => {
    const sm = new SessionManager();
    const sessionId = sm.create();

    // Add collectors for multiple pages
    const console1 = mockCollector<ConsoleEntry>();
    const console2 = mockCollector<ConsoleEntry>();
    const error1 = mockCollector<ErrorEntry>();
    const error2 = mockCollector<ErrorEntry>();
    const network1 = mockCollector<NetworkEntry>();

    sm.setConsoleCollector(sessionId, "http://page1.test", console1);
    sm.setConsoleCollector(sessionId, "http://page2.test", console2);
    sm.setErrorCollector(sessionId, "http://page1.test", error1);
    sm.setErrorCollector(sessionId, "http://page2.test", error2);
    sm.setNetworkCollector(sessionId, "http://page1.test", network1);

    // Add page refs so destroy has something to clean
    sm.setPageRef(sessionId, "http://page1.test", mockPageRef("http://page1.test"));
    sm.setPageRef(sessionId, "http://page2.test", mockPageRef("http://page2.test"));

    // Destroy session
    await sm.destroy(sessionId);

    // Verify all collectors were detached
    expect(console1.detached).toBe(true);
    expect(console2.detached).toBe(true);
    expect(error1.detached).toBe(true);
    expect(error2.detached).toBe(true);
    expect(network1.detached).toBe(true);

    // Verify all collector maps are empty for this session
    expect(sm.getConsoleCollectors(sessionId)).toEqual([]);
    expect(sm.getErrorCollectors(sessionId)).toEqual([]);
    expect(sm.getNetworkCollectors(sessionId)).toEqual([]);
  });

  it("cleans up route handlers for multiple pages", async () => {
    const sm = new SessionManager();
    const sessionId = sm.create();

    // Add route handlers for multiple pages
    sm.addRouteHandler(sessionId, "http://page1.test", {
      urlPattern: "**/*.css",
      action: "block",
      handler: async () => {},
    });
    sm.addRouteHandler(sessionId, "http://page2.test", {
      urlPattern: "**/*.js",
      action: "block",
      handler: async () => {},
    });

    // Add page refs
    sm.setPageRef(sessionId, "http://page1.test", mockPageRef("http://page1.test"));
    sm.setPageRef(sessionId, "http://page2.test", mockPageRef("http://page2.test"));

    // Destroy session
    await sm.destroy(sessionId);

    // Verify all route handlers removed
    expect(sm.getRouteHandlers(sessionId, "http://page1.test")).toEqual([]);
    expect(sm.getRouteHandlers(sessionId, "http://page2.test")).toEqual([]);
  });

  it("does not affect other sessions during destroy", async () => {
    const sm = new SessionManager();
    const session1 = sm.create();
    const session2 = sm.create();

    // Add refs to both sessions
    sm.setPageRef(session1, "http://page1.test", mockPageRef("http://page1.test"));
    sm.setPageRef(session2, "http://page2.test", mockPageRef("http://page2.test"));

    const collector2 = mockCollector<ConsoleEntry>();
    sm.setConsoleCollector(session2, "http://page2.test", collector2);

    // Destroy session 1
    await sm.destroy(session1);

    // Session 2 should be untouched
    expect(sm.get(session2)).toBeDefined();
    expect(sm.getPageRef(session2, "http://page2.test")).toBeDefined();
    expect(collector2.detached).toBe(false);

    // Cleanup
    await sm.destroy(session2);
  });
});
