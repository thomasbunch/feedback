import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("hover_element", () => {
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

  it("hovers element and captures screenshot", async () => {
    const result = await ctx.client.callTool({
      name: "hover_element",
      arguments: {
        sessionId,
        selector: "#hover-target",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text?: string; mimeType?: string }>;
    const imageContent = content.find((c) => c.type === "image");
    expect(imageContent).toBeDefined();

    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
    expect(metadata.action).toBe("hover");
  }, 30_000);

  it("returns error for nonexistent element", async () => {
    const result = await ctx.client.callTool({
      name: "hover_element",
      arguments: {
        sessionId,
        selector: "#does-not-exist",
        pageIdentifier: WEB_URL,
        timeout: 2000,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("not found");
  }, 30_000);
});
