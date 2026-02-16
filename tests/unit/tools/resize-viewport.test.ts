import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15190;
const WEB_URL = `http://localhost:${PORT}`;

describe("resize_viewport", () => {
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

  it("resizes viewport to custom dimensions", async () => {
    const result = await ctx.client.callTool({
      name: "resize_viewport",
      arguments: {
        sessionId,
        width: 800,
        height: 600,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text?: string; mimeType?: string }>;
    const imageContent = content.find((c) => c.type === "image");
    expect(imageContent).toBeDefined();

    const metadata = parseToolResult(result);
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
    expect(metadata.action).toBe("resize");
  }, 30_000);

  it("resizes to mobile preset", async () => {
    const result = await ctx.client.callTool({
      name: "resize_viewport",
      arguments: {
        sessionId,
        preset: "mobile",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const metadata = parseToolResult(result);
    expect(metadata.width).toBe(375);
    expect(metadata.height).toBe(812);
    expect(metadata.preset).toBe("mobile");
  }, 30_000);

  it("resizes to tablet preset", async () => {
    const result = await ctx.client.callTool({
      name: "resize_viewport",
      arguments: {
        sessionId,
        preset: "tablet",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const metadata = parseToolResult(result);
    expect(metadata.width).toBe(768);
    expect(metadata.height).toBe(1024);
  }, 30_000);

  it("resizes to desktop-large preset", async () => {
    const result = await ctx.client.callTool({
      name: "resize_viewport",
      arguments: {
        sessionId,
        preset: "desktop-large",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const metadata = parseToolResult(result);
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(1080);
  }, 30_000);

  it("returns error when neither width/height nor preset provided", async () => {
    const result = await ctx.client.callTool({
      name: "resize_viewport",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);

  it("returns error when only width provided", async () => {
    const result = await ctx.client.callTool({
      name: "resize_viewport",
      arguments: {
        sessionId,
        width: 800,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);

  it("returns error when both custom and preset provided", async () => {
    const result = await ctx.client.callTool({
      name: "resize_viewport",
      arguments: {
        sessionId,
        width: 800,
        height: 600,
        preset: "mobile",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
