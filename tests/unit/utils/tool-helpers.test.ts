/**
 * Unit tests for src/utils/tool-helpers.ts
 * Tests all 6 exports: validateSession, isToolResult, resolvePageOrError,
 * captureAndOptimize, handleSelectorError, SCREENSHOT_DEFAULTS
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session, ToolResult } from "../../../src/types/index.js";
import type { SessionManager } from "../../../src/session-manager.js";

// Mock the dependencies before importing the module under test
vi.mock("../../../src/interaction/selectors.js", () => ({
  getActivePage: vi.fn(),
}));

vi.mock("../../../src/screenshot/capture.js", () => ({
  capturePlaywrightPage: vi.fn(),
}));

vi.mock("../../../src/screenshot/optimize.js", () => ({
  optimizeScreenshot: vi.fn(),
}));

import {
  validateSession,
  isToolResult,
  resolvePageOrError,
  captureAndOptimize,
  handleSelectorError,
  SCREENSHOT_DEFAULTS,
} from "../../../src/utils/tool-helpers.js";

import { getActivePage } from "../../../src/interaction/selectors.js";
import { capturePlaywrightPage } from "../../../src/screenshot/capture.js";
import { optimizeScreenshot } from "../../../src/screenshot/optimize.js";

// Helper to create a mock SessionManager
function createMockSessionManager(overrides: Partial<SessionManager> = {}): SessionManager {
  return {
    get: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    addResource: vi.fn(),
    setPageRef: vi.fn(),
    getPageRef: vi.fn(),
    getPageRefs: vi.fn(),
    getPageRefEntries: vi.fn(),
    removePageRef: vi.fn(),
    rekeyIdentifier: vi.fn(),
    setAutoCapture: vi.fn(),
    getAutoCapture: vi.fn(),
    setConsoleCollector: vi.fn(),
    getConsoleCollector: vi.fn(),
    getConsoleCollectors: vi.fn(),
    setErrorCollector: vi.fn(),
    getErrorCollector: vi.fn(),
    getErrorCollectors: vi.fn(),
    setNetworkCollector: vi.fn(),
    getNetworkCollector: vi.fn(),
    getNetworkCollectors: vi.fn(),
    setProcessCollector: vi.fn(),
    getProcessCollector: vi.fn(),
    getProcessCollectors: vi.fn(),
    addRouteHandler: vi.fn(),
    getRouteHandlers: vi.fn(),
    removeRouteHandler: vi.fn(),
    clearRouteHandlers: vi.fn(),
    hasPopupTracking: vi.fn(),
    setPopupTracking: vi.fn(),
    destroy: vi.fn(),
    destroyAll: vi.fn(),
    ...overrides,
  } as unknown as SessionManager;
}

// Helper to create a mock Session
function createMockSession(id: string = "test-session-123"): Session {
  return {
    id,
    createdAt: new Date("2026-01-01"),
    resources: [],
  };
}

describe("tool-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── SCREENSHOT_DEFAULTS ─────────────────────────────────────────
  describe("SCREENSHOT_DEFAULTS", () => {
    it("maxWidth is 1280", () => {
      expect(SCREENSHOT_DEFAULTS.maxWidth).toBe(1280);
    });

    it("quality is 80", () => {
      expect(SCREENSHOT_DEFAULTS.quality).toBe(80);
    });
  });

  // ── validateSession ─────────────────────────────────────────────
  describe("validateSession", () => {
    it("returns session object when sessionManager.get() returns a session", () => {
      const session = createMockSession("abc-123");
      const sm = createMockSessionManager({
        get: vi.fn().mockReturnValue(session),
      });

      const result = validateSession(sm, "abc-123");
      expect(result).toBe(session);
      expect(sm.get).toHaveBeenCalledWith("abc-123");
    });

    it("returns ToolResult error when session not found and no sessions available", () => {
      const sm = createMockSessionManager({
        get: vi.fn().mockReturnValue(undefined),
        list: vi.fn().mockReturnValue([]),
      });

      const result = validateSession(sm, "nonexistent-id");
      expect(isToolResult(result)).toBe(true);
      const toolResult = result as ToolResult;
      expect(toolResult.isError).toBe(true);
    });

    it("returns ToolResult error with available session list when other sessions exist", () => {
      const sm = createMockSessionManager({
        get: vi.fn().mockReturnValue(undefined),
        list: vi.fn().mockReturnValue(["session-a", "session-b"]),
      });

      const result = validateSession(sm, "nonexistent-id");
      expect(isToolResult(result)).toBe(true);
      const toolResult = result as ToolResult;
      expect(toolResult.isError).toBe(true);
      const text = (toolResult.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("session-a");
      expect(text).toContain("session-b");
    });

    it("error message includes sessionId", () => {
      const sm = createMockSessionManager({
        get: vi.fn().mockReturnValue(undefined),
        list: vi.fn().mockReturnValue([]),
      });

      const result = validateSession(sm, "my-special-id") as ToolResult;
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("my-special-id");
    });

    it("error context says 'ended or never existed'", () => {
      const sm = createMockSessionManager({
        get: vi.fn().mockReturnValue(undefined),
        list: vi.fn().mockReturnValue([]),
      });

      const result = validateSession(sm, "test-id") as ToolResult;
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("ended or never existed");
    });

    it("suggested fix says 'Create a session first' when no sessions available", () => {
      const sm = createMockSessionManager({
        get: vi.fn().mockReturnValue(undefined),
        list: vi.fn().mockReturnValue([]),
      });

      const result = validateSession(sm, "test-id") as ToolResult;
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Create a session first");
    });

    it("suggested fix lists available sessions when some exist", () => {
      const sm = createMockSessionManager({
        get: vi.fn().mockReturnValue(undefined),
        list: vi.fn().mockReturnValue(["sess-1", "sess-2"]),
      });

      const result = validateSession(sm, "test-id") as ToolResult;
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Available sessions");
      expect(text).toContain("sess-1");
      expect(text).toContain("sess-2");
    });
  });

  // ── isToolResult ────────────────────────────────────────────────
  describe("isToolResult", () => {
    it("returns true for ToolResult objects (has content array)", () => {
      const toolResult: ToolResult = {
        content: [{ type: "text", text: "hello" }],
        isError: false,
      };
      expect(isToolResult(toolResult)).toBe(true);
    });

    it("returns false for Session objects", () => {
      const session: Session = {
        id: "test",
        createdAt: new Date(),
        resources: [],
      };
      expect(isToolResult(session)).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isToolResult(null)).toBe(false);
      expect(isToolResult(undefined)).toBe(false);
    });

    it("returns false for plain objects without content", () => {
      expect(isToolResult({ foo: "bar" })).toBe(false);
      expect(isToolResult({})).toBe(false);
      expect(isToolResult({ id: "x", isError: true })).toBe(false);
    });
  });

  // ── resolvePageOrError ──────────────────────────────────────────
  describe("resolvePageOrError", () => {
    const mockGetActivePage = vi.mocked(getActivePage);

    it("returns page+identifier+type when getActivePage succeeds", () => {
      const mockPage = { url: () => "http://localhost:3000" } as any;
      mockGetActivePage.mockReturnValue({
        success: true,
        page: mockPage,
        identifier: "http://localhost:3000",
        type: "web",
      });

      const sm = createMockSessionManager();
      const result = resolvePageOrError(sm, "sess-1");

      expect(isToolResult(result)).toBe(false);
      const pageResult = result as { page: any; identifier: string; type: string };
      expect(pageResult.page).toBe(mockPage);
      expect(pageResult.identifier).toBe("http://localhost:3000");
      expect(pageResult.type).toBe("web");
    });

    it("returns ToolResult error when getActivePage fails (no available pages)", () => {
      mockGetActivePage.mockReturnValue({
        success: false,
        error: "No pages available in this session.",
      });

      const sm = createMockSessionManager();
      const result = resolvePageOrError(sm, "sess-1");

      expect(isToolResult(result)).toBe(true);
      const toolResult = result as ToolResult;
      expect(toolResult.isError).toBe(true);
      const text = (toolResult.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("No pages available");
    });

    it("returns ToolResult error with available pages list when getActivePage fails", () => {
      mockGetActivePage.mockReturnValue({
        success: false,
        error: "Multiple pages found",
        availablePages: ["http://localhost:3000", "electron"],
      });

      const sm = createMockSessionManager();
      const result = resolvePageOrError(sm, "sess-1");

      expect(isToolResult(result)).toBe(true);
      const toolResult = result as ToolResult;
      const text = (toolResult.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("http://localhost:3000");
      expect(text).toContain("electron");
    });

    it("error includes session ID in context", () => {
      mockGetActivePage.mockReturnValue({
        success: false,
        error: "No pages available",
      });

      const sm = createMockSessionManager();
      const result = resolvePageOrError(sm, "my-session-xyz") as ToolResult;
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("my-session-xyz");
    });

    it("passes pageIdentifier through to getActivePage", () => {
      mockGetActivePage.mockReturnValue({
        success: true,
        page: {} as any,
        identifier: "electron",
        type: "electron",
      });

      const sm = createMockSessionManager();
      resolvePageOrError(sm, "sess-1", "electron");

      expect(mockGetActivePage).toHaveBeenCalledWith(sm, "sess-1", "electron");
    });
  });

  // ── captureAndOptimize ──────────────────────────────────────────
  describe("captureAndOptimize", () => {
    const mockCapture = vi.mocked(capturePlaywrightPage);
    const mockOptimize = vi.mocked(optimizeScreenshot);

    it("returns base64 string, mimeType, width, height from optimized result", async () => {
      const rawBuffer = Buffer.from("raw-png-data");
      const optimizedBuffer = Buffer.from("optimized-webp-data");

      mockCapture.mockResolvedValue(rawBuffer);
      mockOptimize.mockResolvedValue({
        data: optimizedBuffer,
        mimeType: "image/webp",
        width: 1024,
        height: 768,
      });

      const mockPage = {} as any;
      const result = await captureAndOptimize(mockPage);

      expect(result.imageBase64).toBe(optimizedBuffer.toString("base64"));
      expect(result.mimeType).toBe("image/webp");
      expect(result.width).toBe(1024);
      expect(result.height).toBe(768);
    });

    it("uses SCREENSHOT_DEFAULTS when no options provided", async () => {
      const rawBuffer = Buffer.from("raw");
      const optimizedBuffer = Buffer.from("optimized");

      mockCapture.mockResolvedValue(rawBuffer);
      mockOptimize.mockResolvedValue({
        data: optimizedBuffer,
        mimeType: "image/webp",
        width: 1280,
        height: 720,
      });

      const mockPage = {} as any;
      await captureAndOptimize(mockPage);

      expect(mockCapture).toHaveBeenCalledWith(mockPage, { fullPage: false });
      expect(mockOptimize).toHaveBeenCalledWith(rawBuffer, {
        maxWidth: 1280,
        quality: 80,
      });
    });

    it("passes custom maxWidth, quality, fullPage options through", async () => {
      const rawBuffer = Buffer.from("raw");
      const optimizedBuffer = Buffer.from("optimized");

      mockCapture.mockResolvedValue(rawBuffer);
      mockOptimize.mockResolvedValue({
        data: optimizedBuffer,
        mimeType: "image/webp",
        width: 800,
        height: 600,
      });

      const mockPage = {} as any;
      await captureAndOptimize(mockPage, {
        maxWidth: 800,
        quality: 60,
        fullPage: true,
      });

      expect(mockCapture).toHaveBeenCalledWith(mockPage, { fullPage: true });
      expect(mockOptimize).toHaveBeenCalledWith(rawBuffer, {
        maxWidth: 800,
        quality: 60,
      });
    });

    it("fullPage defaults to false when not specified", async () => {
      const rawBuffer = Buffer.from("raw");

      mockCapture.mockResolvedValue(rawBuffer);
      mockOptimize.mockResolvedValue({
        data: Buffer.from("opt"),
        mimeType: "image/webp",
        width: 100,
        height: 100,
      });

      const mockPage = {} as any;
      await captureAndOptimize(mockPage, { maxWidth: 640 });

      expect(mockCapture).toHaveBeenCalledWith(mockPage, { fullPage: false });
    });
  });

  // ── handleSelectorError ─────────────────────────────────────────
  describe("handleSelectorError", () => {
    it("returns structured error for 'strict mode violation' messages", () => {
      const error = new Error(
        "locator.click: Error: strict mode violation: locator resolved to 3 elements"
      );

      const result = handleSelectorError(error, {
        selector: ".btn",
        actionName: "click",
      });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Selector matched multiple elements");
      expect(text).toContain(".btn");
      expect(text).toContain("strict mode violation");
    });

    it("returns structured error for 'Timeout' messages (capital T)", () => {
      const error = new Error("Timeout 30000ms exceeded");

      const result = handleSelectorError(error, {
        selector: "#missing",
        timeout: 30000,
        actionName: "click",
      });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Element not found within timeout");
      expect(text).toContain("#missing");
    });

    it("returns structured error for 'timeout' messages (lowercase t)", () => {
      const error = new Error("waiting for selector timeout");

      const result = handleSelectorError(error, {
        selector: ".slow",
        timeout: 5000,
        actionName: "hover",
      });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Element not found within timeout");
    });

    it("returns generic error for other messages with actionName", () => {
      const error = new Error("Element is detached from the DOM");

      const result = handleSelectorError(error, {
        selector: "#detached",
        actionName: "click",
      });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Failed to click");
      expect(text).toContain("#detached");
      expect(text).toContain("Element is detached from the DOM");
    });

    it("handles non-Error objects (strings) gracefully", () => {
      const result = handleSelectorError("Something went wrong", {
        selector: ".foo",
        actionName: "type",
      });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Failed to type");
      expect(text).toContain("Something went wrong");
    });
  });
});
