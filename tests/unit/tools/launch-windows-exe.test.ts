import path from "path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WIN_FIXTURE_DIR } from "../../helpers/fixtures.js";

/** Parse the JSON text from an MCP tool result */
function parseToolResult(result: { content: unknown }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  const textEntry = content.find((c) => c.type === "text");
  if (!textEntry) throw new Error("No text content in tool result");
  return JSON.parse(textEntry.text);
}

describe("launch_windows_exe", () => {
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
      name: "launch_windows_exe",
      arguments: {
        sessionId: "bad-id",
        exePath: "node",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });

  it("launches Windows fixture app", async () => {
    // Use process.execPath for the absolute path to node binary
    // The tool resolves exePath with path.resolve(), so it must be absolute
    const result = await ctx.client.callTool({
      name: "launch_windows_exe",
      arguments: {
        sessionId,
        exePath: process.execPath,
        args: [path.join(WIN_FIXTURE_DIR, "server.js")],
        cwd: WIN_FIXTURE_DIR,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.status).toBe("running");
    expect(typeof data.pid).toBe("number");
  }, 30_000);

  it("returns error for nonexistent exe path", async () => {
    const result = await ctx.client.callTool({
      name: "launch_windows_exe",
      arguments: {
        sessionId,
        exePath: "C:\\nonexistent\\fake.exe",
      },
    });

    // Should be an error (either spawn error or immediate exit)
    expect(result.isError).toBe(true);
  }, 15_000);
});
