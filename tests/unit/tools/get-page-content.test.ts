import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = WEB_PORT + 20; // 15120 — unique port for this test suite

describe("get_page_content", () => {
  let ctx: TestContext;
  let sessionId: string;
  const url = `http://localhost:${PORT}`;

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

    // Establish page ref via screenshot_web
    const ssResult = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url },
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

  it("extracts text content from full page", async () => {
    const result = await ctx.client.callTool({
      name: "get_page_content",
      arguments: { sessionId, pageIdentifier: url },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.format).toBe("text");
    expect(data.selector).toBeNull();
    expect(data.truncated).toBe(false);
    expect(typeof data.content).toBe("string");
    expect(data.content as string).toContain("Hello Fixture");
  }, 30_000);

  it("extracts text content from specific element", async () => {
    const result = await ctx.client.callTool({
      name: "get_page_content",
      arguments: { sessionId, pageIdentifier: url, selector: "#content-block" },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.content as string).toContain("sample content");
    expect(data.content as string).toContain("Item 1");
  }, 30_000);

  it("extracts HTML from specific element", async () => {
    const result = await ctx.client.callTool({
      name: "get_page_content",
      arguments: {
        sessionId,
        pageIdentifier: url,
        selector: "#content-block",
        format: "html",
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.format).toBe("html");
    expect(data.content as string).toContain("<strong>sample content</strong>");
    expect(data.content as string).toContain("<li>Item 1</li>");
  }, 30_000);

  it("extracts HTML from full page", async () => {
    const result = await ctx.client.callTool({
      name: "get_page_content",
      arguments: { sessionId, pageIdentifier: url, format: "html" },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.format).toBe("html");
    expect(data.content as string).toContain("<html");
    expect(data.content as string).toContain("<body");
  }, 30_000);

  it("truncates content with maxLength", async () => {
    const result = await ctx.client.callTool({
      name: "get_page_content",
      arguments: { sessionId, pageIdentifier: url, maxLength: 50 },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.length).toBe(50);
    expect(data.truncated).toBe(true);
  }, 30_000);

  it("returns error for nonexistent element", async () => {
    const result = await ctx.client.callTool({
      name: "get_page_content",
      arguments: {
        sessionId,
        pageIdentifier: url,
        selector: "#does-not-exist",
        timeout: 2000,
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
