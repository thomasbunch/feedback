import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15280;
const WEB_URL = `http://localhost:${PORT}`;

describe("manage_tabs", () => {
  let ctx: TestContext;
  let sessionId: string;

  beforeAll(async () => {
    ctx = await createTestClient();

    // Create session
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const createData = parseToolResult(createResult);
    sessionId = createData.sessionId as string;

    // Launch web server
    const launchResult = await ctx.client.callTool({
      name: "launch_web_server",
      arguments: {
        sessionId,
        command: "npx",
        args: ["vite", "--port", String(PORT)],
        cwd: WEB_FIXTURE_DIR,
        port: PORT,
        timeoutMs: 30000,
      },
    });
    expect(launchResult.isError).toBeFalsy();

    // Take screenshot to establish browser + page ref
    const ssResult = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url: WEB_URL },
    });
    expect(ssResult.isError).toBeFalsy();
  }, 60_000);

  afterAll(async () => {
    try {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
    } catch {
      // Ignore cleanup errors
    }
    await ctx.cleanup();
  }, 30_000);

  it("lists open tabs", async () => {
    const result = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "list",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.action).toBe("list");
    expect(data.count).toBeGreaterThanOrEqual(1);
    const tabs = data.tabs as Array<{ url: string; title: string }>;
    expect(tabs.some((t) => t.url.includes("localhost"))).toBe(true);
  }, 30_000);

  it("opens a new tab and returns screenshot", async () => {
    const result = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "open",
        url: `${WEB_URL}/page2.html`,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string }>;
    expect(content.some((c) => c.type === "image")).toBe(true);

    const data = parseToolResult(result);
    expect(data.success).toBe(true);
    expect(data.action).toBe("open_tab");

    // Verify tab count increased
    const listResult = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "list",
        pageIdentifier: WEB_URL,
      },
    });
    const listData = parseToolResult(listResult);
    expect(listData.count).toBe(2);
  }, 30_000);

  it("switches to a different tab and returns screenshot", async () => {
    const result = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "switch",
        targetPage: WEB_URL,
        pageIdentifier: `${WEB_URL}/page2.html`,
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string }>;
    expect(content.some((c) => c.type === "image")).toBe(true);

    const data = parseToolResult(result);
    expect(data.success).toBe(true);
    expect(data.action).toBe("switch_tab");
  }, 30_000);

  it("closes a tab", async () => {
    // Verify we have 2 tabs
    const listBefore = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "list",
        pageIdentifier: WEB_URL,
      },
    });
    const beforeData = parseToolResult(listBefore);
    expect(beforeData.count).toBe(2);

    // Close the second tab
    const result = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "close",
        targetPage: `${WEB_URL}/page2.html`,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.closed).toBe(true);

    // Verify tab count decreased
    const listAfter = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "list",
        pageIdentifier: WEB_URL,
      },
    });
    const afterData = parseToolResult(listAfter);
    expect(afterData.count).toBe(1);
  }, 30_000);

  it("prevents closing the last tab", async () => {
    const result = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "close",
        targetPage: WEB_URL,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0].text;
    expect(text).toMatch(/last tab|Cannot close/i);
  }, 30_000);

  it("tracks popup windows opened via window.open", async () => {
    // Set up popup tracking via list
    await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "list",
        pageIdentifier: WEB_URL,
      },
    });

    // Click the window.open button
    await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#window-open-btn",
        pageIdentifier: WEB_URL,
      },
    });

    // Wait for popup to load
    await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "await new Promise(r => setTimeout(r, 2000)); 'done'",
        pageIdentifier: WEB_URL,
      },
    });

    // List tabs -- should now include the popup
    const listResult = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "list",
        pageIdentifier: WEB_URL,
      },
    });
    const listData = parseToolResult(listResult);
    expect(listData.count).toBeGreaterThanOrEqual(2);
    const tabs = listData.tabs as Array<{ url: string; title: string }>;
    expect(tabs.some((t) => t.url.includes("page2.html"))).toBe(true);

    // Clean up: find and close the popup
    const identifiers = listData.identifiers as string[];
    const popupId = identifiers.find((id) => id.includes("page2.html"));
    if (popupId) {
      await ctx.client.callTool({
        name: "manage_tabs",
        arguments: {
          sessionId,
          action: "close",
          targetPage: popupId,
          pageIdentifier: WEB_URL,
        },
      });
    }
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId: "invalid-session-id",
        action: "list",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0].text;
    expect(text).toContain("Session not found");
  }, 30_000);

  it("returns error when targetPage missing for switch", async () => {
    const result = await ctx.client.callTool({
      name: "manage_tabs",
      arguments: {
        sessionId,
        action: "switch",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0].text;
    expect(text).toMatch(/targetPage|required/i);
  }, 30_000);
});
