import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";

/** Parse the JSON text from an MCP tool result */
function parseToolResult(result: { content: unknown }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  const textEntry = content.find((c) => c.type === "text");
  if (!textEntry) throw new Error("No text content in tool result");
  return JSON.parse(textEntry.text);
}

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("get_screenshot", () => {
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
        args: ["vite", "--port", String(WEB_PORT)],
        cwd: WEB_FIXTURE_DIR,
        port: WEB_PORT,
        timeoutMs: 30000,
      },
    });
    expect(launchResult.isError).toBeFalsy();

    // Take initial screenshot to create browser and set up auto-capture
    const screenshotResult = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: {
        sessionId,
        url: WEB_URL,
      },
    });
    expect(screenshotResult.isError).toBeFalsy();
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

  it("returns auto-captured screenshot after navigation", async () => {
    // Navigate to page2 to trigger auto-capture via framenavigated event
    // pageIdentifier is the current pageRef key (the URL passed to screenshot_web)
    const navResult = await ctx.client.callTool({
      name: "navigate",
      arguments: {
        sessionId,
        url: `${WEB_URL}/page2.html`,
        pageIdentifier: WEB_URL,
      },
    });
    expect(navResult.isError).toBeFalsy();

    // Wait for auto-capture handler to complete (async screenshot + optimization)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Retrieve auto-captured screenshot
    const result = await ctx.client.callTool({
      name: "get_screenshot",
      arguments: { sessionId },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as any[];
    expect(content.length).toBe(2);

    // Parse metadata
    const metadata = JSON.parse(content[0].text);
    expect(metadata.source).toBe("auto-capture");
    expect(metadata.url).toContain("page2.html");

    // Check image content
    const imageContent = content.find((c: any) => c.type === "image");
    expect(imageContent).toBeDefined();
    expect(imageContent.mimeType).toBe("image/webp");
  }, 30_000);

  it("returns error when no auto-capture exists", async () => {
    // Create a fresh session with no browser
    const freshResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const freshData = parseToolResult(freshResult);
    const freshSessionId = freshData.sessionId as string;

    const result = await ctx.client.callTool({
      name: "get_screenshot",
      arguments: { sessionId: freshSessionId },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("No auto-captured screenshot available");

    // Clean up fresh session
    try {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId: freshSessionId },
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "get_screenshot",
      arguments: { sessionId: "bad-id" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });
});
