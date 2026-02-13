import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("scroll", () => {
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

  it("scrolls element into view", async () => {
    const result = await ctx.client.callTool({
      name: "scroll",
      arguments: {
        sessionId,
        target: "#scroll-bottom-marker",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
    expect(metadata.scrollMode).toBe("intoView");
  }, 30_000);

  it("scrolls by pixels (down)", async () => {
    const result = await ctx.client.callTool({
      name: "scroll",
      arguments: {
        sessionId,
        target: "#scroll-container",
        direction: "down",
        amount: 200,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
    expect(metadata.scrollMode).toBe("direction:down");
  }, 30_000);

  it("scrolls to bottom", async () => {
    const result = await ctx.client.callTool({
      name: "scroll",
      arguments: {
        sessionId,
        scrollTo: "bottom",
        target: "#scroll-container",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
    expect(metadata.scrollMode).toBe("scrollTo:bottom");
  }, 30_000);

  it("scrolls to top", async () => {
    // First scroll to bottom
    await ctx.client.callTool({
      name: "scroll",
      arguments: {
        sessionId,
        scrollTo: "bottom",
        target: "#scroll-container",
        pageIdentifier: WEB_URL,
      },
    });

    // Then scroll to top
    const result = await ctx.client.callTool({
      name: "scroll",
      arguments: {
        sessionId,
        scrollTo: "top",
        target: "#scroll-container",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
    expect(metadata.scrollMode).toBe("scrollTo:top");
  }, 30_000);

  it("returns error when no scroll parameters given", async () => {
    const result = await ctx.client.callTool({
      name: "scroll",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("No scroll parameters");
  }, 30_000);
});
