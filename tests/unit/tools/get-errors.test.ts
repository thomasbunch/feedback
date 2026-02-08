import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("get_errors", () => {
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

    // screenshot_web attaches error collectors
    const ssResult = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url: WEB_URL },
    });
    expect(ssResult.isError).toBeFalsy();

    // Wait for page to stabilize
    await new Promise((resolve) => setTimeout(resolve, 1000));
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

  it("captures runtime exceptions thrown in the page", async () => {
    // Click the #throw-error button which does: throw new Error("Deliberate test error")
    await ctx.client.callTool({
      name: "click_element",
      arguments: { sessionId, selector: "#throw-error", pageIdentifier: WEB_URL },
    });

    // Wait for error propagation
    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = await ctx.client.callTool({
      name: "get_errors",
      arguments: { sessionId },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);

    expect(data.count).toBeGreaterThan(0);
    const entries = data.entries as Array<{ type: string; message: string; stack?: string }>;

    // Find the deliberate test error
    const deliberateError = entries.find((e) =>
      e.message.includes("Deliberate test error")
    );
    expect(deliberateError).toBeDefined();
    expect(deliberateError!.type).toBe("uncaught-exception");
  }, 30_000);

  it("filters errors by type", async () => {
    // Filter uncaught-exception
    const uncaughtResult = await ctx.client.callTool({
      name: "get_errors",
      arguments: { sessionId, type: "uncaught-exception" },
    });
    const uncaughtData = parseToolResult(uncaughtResult);
    const uncaughtEntries = uncaughtData.entries as Array<{ type: string; message: string }>;

    // All returned entries must be uncaught-exception
    for (const entry of uncaughtEntries) {
      expect(entry.type).toBe("uncaught-exception");
    }

    // Filter page-crash -- should return 0 (no crashes occurred)
    const crashResult = await ctx.client.callTool({
      name: "get_errors",
      arguments: { sessionId, type: "page-crash" },
    });
    const crashData = parseToolResult(crashResult);
    expect(crashData.count).toBe(0);
  }, 30_000);

  it("returns empty result for session with no collectors", async () => {
    // Create a new session without screenshot_web
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const newData = parseToolResult(createResult);
    const newSessionId = newData.sessionId as string;

    const result = await ctx.client.callTool({
      name: "get_errors",
      arguments: { sessionId: newSessionId },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.count).toBe(0);
    expect(data.note).toContain("No errors captured yet");

    // Clean up new session
    await ctx.client.callTool({
      name: "end_session",
      arguments: { sessionId: newSessionId },
    });
  }, 30_000);
});
