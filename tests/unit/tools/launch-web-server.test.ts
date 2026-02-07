import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";

/** Parse the JSON text from an MCP tool result */
function parseToolResult(result: { content: unknown }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  const textEntry = content.find((c) => c.type === "text");
  if (!textEntry) throw new Error("No text content in tool result");
  return JSON.parse(textEntry.text);
}

describe("launch_web_server", () => {
  let ctx: TestContext;
  let sessionId: string;

  beforeAll(async () => {
    ctx = await createTestClient();
  }, 30_000);

  afterAll(async () => {
    await ctx.cleanup();
  }, 30_000);

  beforeEach(async () => {
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const createData = parseToolResult(createResult);
    sessionId = createData.sessionId as string;
  });

  afterEach(async () => {
    try {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "launch_web_server",
      arguments: {
        sessionId: "bad-id",
        command: "npx",
        args: ["vite"],
        cwd: WEB_FIXTURE_DIR,
        port: WEB_PORT,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });

  it("launches Vite dev server and detects readiness", async () => {
    const result = await ctx.client.callTool({
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

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.status).toBe("ready");
    expect(typeof data.pid).toBe("number");
    expect(data.port).toBe(WEB_PORT);
  }, 60_000);

  it("check_port confirms server is listening after launch", async () => {
    // Launch web server first
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

    // Verify port is occupied
    const portResult = await ctx.client.callTool({
      name: "check_port",
      arguments: { port: WEB_PORT },
    });

    expect(portResult.isError).toBeFalsy();
    const portData = parseToolResult(portResult);
    expect(portData.available).toBe(false);
  }, 60_000);
});
