import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

describe("stop_process", () => {
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
    // Best-effort cleanup -- session may already be destroyed
    try {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("returns error for nonexistent session", async () => {
    const result = await ctx.client.callTool({
      name: "stop_process",
      arguments: { sessionId: "nonexistent-id" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });

  it("stops session with running web server", async () => {
    // Launch a web server in this session
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

    const launchData = parseToolResult(launchResult);
    expect(launchData.status).toBe("ready");

    // Stop all processes
    const stopResult = await ctx.client.callTool({
      name: "stop_process",
      arguments: { sessionId },
    });

    expect(stopResult.isError).toBeFalsy();
    const stopData = parseToolResult(stopResult);
    expect(stopData.stopped).toBe(true);

    // Verify session is gone
    const listResult = await ctx.client.callTool({
      name: "list_sessions",
      arguments: {},
    });
    const listData = parseToolResult(listResult);
    const sessions = listData.sessions as string[];
    expect(sessions).not.toContain(sessionId);
  }, 60_000);

  it("stop_process then end_session returns error", async () => {
    // Stop (destroys the session)
    const stopResult = await ctx.client.callTool({
      name: "stop_process",
      arguments: { sessionId },
    });
    expect(stopResult.isError).toBeFalsy();

    // end_session on same session should fail
    const endResult = await ctx.client.callTool({
      name: "end_session",
      arguments: { sessionId },
    });
    expect(endResult.isError).toBe(true);
    const content = endResult.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });
});
