import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15180;
const WEB_URL = `http://localhost:${PORT}`;

describe("handle_dialog", () => {
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

  it("handles alert dialog with accept", async () => {
    // Pre-register dialog handler
    const handleResult = await ctx.client.callTool({
      name: "handle_dialog",
      arguments: {
        sessionId,
        action: "accept",
        pageIdentifier: WEB_URL,
      },
    });

    expect(handleResult.isError).toBeFalsy();
    const handleData = parseToolResult(handleResult);
    expect(handleData.registered).toBe(true);

    // Click the alert trigger button
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#trigger-alert",
        pageIdentifier: WEB_URL,
      },
    });

    expect(clickResult.isError).toBeFalsy();
  }, 30_000);

  it("handles confirm dialog with accept", async () => {
    // Pre-register dialog handler
    const handleResult = await ctx.client.callTool({
      name: "handle_dialog",
      arguments: {
        sessionId,
        action: "accept",
        pageIdentifier: WEB_URL,
      },
    });
    expect(handleResult.isError).toBeFalsy();

    // Click the confirm trigger button
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#trigger-confirm",
        pageIdentifier: WEB_URL,
      },
    });
    expect(clickResult.isError).toBeFalsy();

    // Verify the confirm result was recorded
    const contentResult = await ctx.client.callTool({
      name: "get_page_content",
      arguments: {
        sessionId,
        selector: "#output",
        pageIdentifier: WEB_URL,
      },
    });
    expect(contentResult.isError).toBeFalsy();
    const contentData = parseToolResult(contentResult);
    expect(contentData.content).toContain("Confirm: true");
  }, 30_000);

  it("handles confirm dialog with dismiss", async () => {
    // Pre-register dialog handler with dismiss
    const handleResult = await ctx.client.callTool({
      name: "handle_dialog",
      arguments: {
        sessionId,
        action: "dismiss",
        pageIdentifier: WEB_URL,
      },
    });
    expect(handleResult.isError).toBeFalsy();

    // Click the confirm trigger button
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#trigger-confirm",
        pageIdentifier: WEB_URL,
      },
    });
    expect(clickResult.isError).toBeFalsy();

    // Verify the confirm result was recorded as false
    const contentResult = await ctx.client.callTool({
      name: "get_page_content",
      arguments: {
        sessionId,
        selector: "#output",
        pageIdentifier: WEB_URL,
      },
    });
    expect(contentResult.isError).toBeFalsy();
    const contentData = parseToolResult(contentResult);
    expect(contentData.content).toContain("Confirm: false");
  }, 30_000);

  it("handles prompt dialog with accept and text", async () => {
    // Pre-register dialog handler with promptText
    const handleResult = await ctx.client.callTool({
      name: "handle_dialog",
      arguments: {
        sessionId,
        action: "accept",
        promptText: "custom input",
        pageIdentifier: WEB_URL,
      },
    });
    expect(handleResult.isError).toBeFalsy();

    // Click the prompt trigger button
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#trigger-prompt",
        pageIdentifier: WEB_URL,
      },
    });
    expect(clickResult.isError).toBeFalsy();

    // Verify the prompt result was recorded
    const contentResult = await ctx.client.callTool({
      name: "get_page_content",
      arguments: {
        sessionId,
        selector: "#output",
        pageIdentifier: WEB_URL,
      },
    });
    expect(contentResult.isError).toBeFalsy();
    const contentData = parseToolResult(contentResult);
    expect(contentData.content).toContain("Prompt: custom input");
  }, 30_000);

  it("handles prompt dialog with dismiss", async () => {
    // Pre-register dialog handler with dismiss
    const handleResult = await ctx.client.callTool({
      name: "handle_dialog",
      arguments: {
        sessionId,
        action: "dismiss",
        pageIdentifier: WEB_URL,
      },
    });
    expect(handleResult.isError).toBeFalsy();

    // Click the prompt trigger button
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#trigger-prompt",
        pageIdentifier: WEB_URL,
      },
    });
    expect(clickResult.isError).toBeFalsy();

    // Verify the prompt result was recorded as null (dismissed)
    const contentResult = await ctx.client.callTool({
      name: "get_page_content",
      arguments: {
        sessionId,
        selector: "#output",
        pageIdentifier: WEB_URL,
      },
    });
    expect(contentResult.isError).toBeFalsy();
    const contentData = parseToolResult(contentResult);
    expect(contentData.content).toContain("Prompt: null");
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "handle_dialog",
      arguments: {
        sessionId: "invalid",
        action: "accept",
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
