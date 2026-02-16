import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15230;
const WEB_URL = `http://localhost:${PORT}`;

describe("get_accessibility_tree", () => {
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

  it("captures full page accessibility tree", async () => {
    const result = await ctx.client.callTool({
      name: "get_accessibility_tree",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.selector).toBe("body");
    expect(typeof data.snapshot).toBe("string");
    expect((data.snapshot as string).length).toBeGreaterThan(0);

    // The page has an h1 "Hello Fixture" so the snapshot should mention heading
    const snapshot = data.snapshot as string;
    expect(snapshot.toLowerCase()).toContain("heading");
  }, 30_000);

  it("captures scoped accessibility tree", async () => {
    const result = await ctx.client.callTool({
      name: "get_accessibility_tree",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
        selector: "#a11y-good-section",
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.selector).toBe("#a11y-good-section");
    expect(typeof data.snapshot).toBe("string");

    // Should contain the accessible heading from the scoped section
    const snapshot = data.snapshot as string;
    expect(snapshot).toContain("Accessible Heading");
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "get_accessibility_tree",
      arguments: {
        sessionId: "invalid",
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
