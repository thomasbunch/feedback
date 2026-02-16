import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

describe("launch_tauri", () => {
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
      name: "launch_tauri",
      arguments: {
        sessionId: "bad-id",
        binaryPath: "C:\\nonexistent\\fake-app.exe",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });

  it("returns error for non-existent binary path", async () => {
    const result = await ctx.client.callTool({
      name: "launch_tauri",
      arguments: {
        sessionId,
        binaryPath: "C:\\nonexistent\\fake-app.exe",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    // On non-Windows: platform error; On Windows: binary not found error
    expect(text.length).toBeGreaterThan(0);
  });

  it.skipIf(process.platform === "win32")("returns error on non-Windows platform", async () => {
    const result = await ctx.client.callTool({
      name: "launch_tauri",
      arguments: {
        sessionId,
        binaryPath: "/tmp/fake-app",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Windows");
  });

  it("accepts valid parameters without type errors", async () => {
    // Call with all optional parameters to validate Zod schema accepts full shape
    const result = await ctx.client.callTool({
      name: "launch_tauri",
      arguments: {
        sessionId: "nonexistent-session",
        binaryPath: "C:\\nonexistent\\fake-app.exe",
        args: ["--debug"],
        cwd: "C:\\nonexistent",
        cdpPort: 9333,
        timeoutMs: 5000,
      },
    });

    // Should get session-not-found error (proves params were accepted by Zod)
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });
});
