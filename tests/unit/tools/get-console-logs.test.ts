import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("get_console_logs", () => {
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

    // screenshot_web creates browser, attaches collectors, then navigates
    // Collectors capture console messages from the initial page load
    const ssResult = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url: WEB_URL },
    });
    expect(ssResult.isError).toBeFalsy();

    // Wait for console messages to be captured
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

  it("returns console logs captured during the session", async () => {
    const result = await ctx.client.callTool({
      name: "get_console_logs",
      arguments: { sessionId },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);

    expect(data.count).toBeGreaterThan(0);
    const entries = data.entries as Array<{ level: string; text: string }>;
    expect(entries.length).toBeGreaterThan(0);

    // Each entry must have level and text fields
    for (const entry of entries) {
      expect(entry).toHaveProperty("level");
      expect(entry).toHaveProperty("text");
    }

    // Fixture app emits: console.log("Fixture app loaded"),
    // console.warn("Fixture warning"), console.error("Fixture error")
    const allText = entries.map((e) => e.text).join(" ");
    const hasFixtureMessages =
      allText.includes("Fixture app loaded") ||
      allText.includes("Fixture warning") ||
      allText.includes("Fixture error");
    expect(hasFixtureMessages).toBe(true);
  }, 30_000);

  it("filters console logs by level", async () => {
    // First inspect what levels are actually captured
    const allResult = await ctx.client.callTool({
      name: "get_console_logs",
      arguments: { sessionId },
    });
    const allData = parseToolResult(allResult);
    const allEntries = allData.entries as Array<{ level: string; text: string }>;

    // Should have entries from the reload
    const levels = [...new Set(allEntries.map((e) => e.level))];
    expect(levels.length).toBeGreaterThan(0);

    // Filter by "error" level -- fixture emits console.error("Fixture error")
    const errorResult = await ctx.client.callTool({
      name: "get_console_logs",
      arguments: { sessionId, level: "error" },
    });
    const errorData = parseToolResult(errorResult);
    const errorEntries = errorData.entries as Array<{ level: string; text: string }>;

    // All returned entries must have level "error"
    for (const entry of errorEntries) {
      expect(entry.level).toBe("error");
    }

    // Test "warning" filter -- fixture emits console.warn("Fixture warning")
    // Note: Playwright ConsoleMessage.type() may return "warn" not "warning"
    // If the console collector normalizes "warn" -> "warning" this should work.
    // If not, this filter may return 0 entries (documented as potential bug).
    const warnResult = await ctx.client.callTool({
      name: "get_console_logs",
      arguments: { sessionId, level: "warning" },
    });
    const warnData = parseToolResult(warnResult);
    const warnEntries = warnData.entries as Array<{ level: string; text: string }>;

    // All returned entries must have level "warning"
    for (const entry of warnEntries) {
      expect(entry.level).toBe("warning");
    }

    // Investigate warn vs warning: check if any entries have level "warn"
    const warnLevelEntries = allEntries.filter((e) => e.level === "warn");
    if (warnLevelEntries.length > 0 && warnEntries.length === 0) {
      // Bug confirmed: Playwright returns "warn" but schema expects "warning"
      // This should be fixed in console-collector.ts
      throw new Error(
        'Bug: console collector stores level "warn" but tool schema expects "warning". ' +
        "Fix console-collector.ts to normalize warn -> warning."
      );
    }
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
      name: "get_console_logs",
      arguments: { sessionId: newSessionId },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.count).toBe(0);
    expect(data.note).toContain("No console logs captured yet");

    // Clean up new session
    await ctx.client.callTool({
      name: "end_session",
      arguments: { sessionId: newSessionId },
    });
  }, 30_000);
});
