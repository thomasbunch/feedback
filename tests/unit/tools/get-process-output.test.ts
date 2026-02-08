import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

describe("get_process_output", () => {
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

    // Launch web server -- process collector is attached by launch_web_server
    // No screenshot_web needed for process output capture
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

    // Wait for Vite startup output to be captured
    await new Promise((resolve) => setTimeout(resolve, 2000));
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

  it("returns stdout/stderr from spawned process", async () => {
    const result = await ctx.client.callTool({
      name: "get_process_output",
      arguments: { sessionId },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);

    expect(data.count).toBeGreaterThan(0);
    const entries = data.entries as Array<{ stream: string; text: string }>;
    expect(entries.length).toBeGreaterThan(0);

    // Each entry must have stream and text fields
    for (const entry of entries) {
      expect(entry).toHaveProperty("stream");
      expect(entry).toHaveProperty("text");
      expect(["stdout", "stderr"]).toContain(entry.stream);
      expect(entry.text.length).toBeGreaterThan(0);
    }

    // Look for Vite startup output (may contain ANSI escape codes)
    const allText = entries.map((e) => e.text).join(" ");
    const hasViteOutput =
      allText.includes("VITE") ||
      allText.includes("ready") ||
      allText.includes("Local:") ||
      allText.includes("localhost");
    expect(hasViteOutput).toBe(true);
  }, 30_000);

  it("filters process output by stream", async () => {
    // Filter by stdout
    const stdoutResult = await ctx.client.callTool({
      name: "get_process_output",
      arguments: { sessionId, stream: "stdout" },
    });
    const stdoutData = parseToolResult(stdoutResult);
    const stdoutEntries = stdoutData.entries as Array<{ stream: string; text: string }>;

    // All returned entries must have stream "stdout"
    for (const entry of stdoutEntries) {
      expect(entry.stream).toBe("stdout");
    }

    // Filter by stderr
    const stderrResult = await ctx.client.callTool({
      name: "get_process_output",
      arguments: { sessionId, stream: "stderr" },
    });
    const stderrData = parseToolResult(stderrResult);
    const stderrEntries = stderrData.entries as Array<{ stream: string; text: string }>;

    // All returned entries must have stream "stderr"
    for (const entry of stderrEntries) {
      expect(entry.stream).toBe("stderr");
    }

    // At least one stream should have entries (Vite outputs to stdout)
    expect(stdoutEntries.length + stderrEntries.length).toBeGreaterThan(0);
  }, 30_000);

  it("returns empty result for session with no process", async () => {
    // Create a new session without launching any process
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const newData = parseToolResult(createResult);
    const newSessionId = newData.sessionId as string;

    const result = await ctx.client.callTool({
      name: "get_process_output",
      arguments: { sessionId: newSessionId },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.count).toBe(0);
    expect(data.note).toContain("No process output captured yet");

    // Clean up new session
    await ctx.client.callTool({
      name: "end_session",
      arguments: { sessionId: newSessionId },
    });
  }, 30_000);
});
