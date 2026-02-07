import path from "path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { ELECTRON_FIXTURE_DIR } from "../../helpers/fixtures.js";

/** Parse the JSON text from an MCP tool result */
function parseToolResult(result: { content: unknown }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  const textEntry = content.find((c) => c.type === "text");
  if (!textEntry) throw new Error("No text content in tool result");
  return JSON.parse(textEntry.text);
}

describe("launch_electron", () => {
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
      name: "launch_electron",
      arguments: {
        sessionId: "bad-id",
        entryPath: path.join(ELECTRON_FIXTURE_DIR, "main.js"),
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });

  it("launches Electron fixture app", async () => {
    const result = await ctx.client.callTool({
      name: "launch_electron",
      arguments: {
        sessionId,
        entryPath: path.join(ELECTRON_FIXTURE_DIR, "main.js"),
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.status).toBe("ready");
    expect(data.entryPath).toBeDefined();
    expect(data.windowTitle).toBeDefined();
  }, 60_000);
});
