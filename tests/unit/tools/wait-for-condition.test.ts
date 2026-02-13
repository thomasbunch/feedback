import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15201;
const WEB_URL = `http://localhost:${PORT}`;

describe("wait_for_condition", () => {
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

  it("waits for network idle", async () => {
    const result = await ctx.client.callTool({
      name: "wait_for_condition",
      arguments: {
        sessionId,
        type: "network_idle",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text?: string; mimeType?: string }>;
    const imageContent = content.find((c) => c.type === "image");
    expect(imageContent).toBeDefined();

    const metadata = parseToolResult(result);
    expect(metadata.action).toBe("wait");
    expect(metadata.type).toBe("network_idle");
    expect(metadata.success).toBe(true);
  }, 30_000);

  it("waits for JavaScript expression", async () => {
    // First ensure async-result is hidden
    await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "document.getElementById('async-result').style.display = 'none'; true",
        pageIdentifier: WEB_URL,
      },
    });

    // Click the trigger button (shows element after 500ms delay)
    await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#trigger-async",
        pageIdentifier: WEB_URL,
      },
    });

    // Wait for the async result to appear
    const result = await ctx.client.callTool({
      name: "wait_for_condition",
      arguments: {
        sessionId,
        type: "javascript",
        expression: "document.getElementById('async-result').style.display !== 'none'",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const metadata = parseToolResult(result);
    expect(metadata.action).toBe("wait");
    expect(metadata.type).toBe("javascript");
    expect(metadata.success).toBe(true);

    // Verify the content is visible
    const contentResult = await ctx.client.callTool({
      name: "get_page_content",
      arguments: {
        sessionId,
        selector: "#async-result",
        pageIdentifier: WEB_URL,
      },
    });
    expect(contentResult.isError).toBeFalsy();
    const contentData = parseToolResult(contentResult);
    expect(contentData.content).toContain("Async loaded");

    // Reset for other tests
    await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "document.getElementById('async-result').style.display = 'none'; true",
        pageIdentifier: WEB_URL,
      },
    });
  }, 30_000);

  it("returns error when expression missing for javascript type", async () => {
    const result = await ctx.client.callTool({
      name: "wait_for_condition",
      arguments: {
        sessionId,
        type: "javascript",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Expression required");
  }, 30_000);

  it("returns error when urlPattern missing for url type", async () => {
    const result = await ctx.client.callTool({
      name: "wait_for_condition",
      arguments: {
        sessionId,
        type: "url",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("URL pattern required");
  }, 30_000);

  it("returns error for timeout on JavaScript condition", async () => {
    const result = await ctx.client.callTool({
      name: "wait_for_condition",
      arguments: {
        sessionId,
        type: "javascript",
        expression: "window.__never_true_12345 === true",
        timeout: 2000,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text.toLowerCase()).toMatch(/not met|timeout/);
  }, 45_000);
});
