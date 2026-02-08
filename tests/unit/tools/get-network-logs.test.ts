import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("get_network_logs", () => {
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
    // Network collector captures requests from the initial page load
    const ssResult = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url: WEB_URL },
    });
    expect(ssResult.isError).toBeFalsy();

    // Wait for page resources to finish loading
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

  it("captures network requests from page reload", async () => {
    const result = await ctx.client.callTool({
      name: "get_network_logs",
      arguments: { sessionId },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);

    // Reload should have generated network requests (HTML, JS modules, etc.)
    expect(data.count).toBeGreaterThan(0);
    const entries = data.entries as Array<{
      url: string;
      method: string;
      status: number;
      resourceType: string;
    }>;
    expect(entries.length).toBeGreaterThan(0);

    // Each entry must have url, method, status fields
    for (const entry of entries) {
      expect(entry).toHaveProperty("url");
      expect(entry).toHaveProperty("method");
      expect(entry).toHaveProperty("status");
    }
  }, 30_000);

  it("captures fetch request and filters errors", async () => {
    // Click #fetch-data button which does: fetch("/api/data")
    await ctx.client.callTool({
      name: "click_element",
      arguments: { sessionId, selector: "#fetch-data", pageIdentifier: WEB_URL },
    });

    // Wait for fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get all network logs -- should contain the /api/data request
    const allResult = await ctx.client.callTool({
      name: "get_network_logs",
      arguments: { sessionId },
    });
    const allData = parseToolResult(allResult);
    const allEntries = allData.entries as Array<{
      url: string;
      method: string;
      status: number;
    }>;

    // Find the /api/data request
    const apiEntry = allEntries.find((e) => e.url.includes("/api/data"));
    expect(apiEntry).toBeDefined();

    // Now test the errors filter (status >= 400 or status === 0)
    const errorsResult = await ctx.client.callTool({
      name: "get_network_logs",
      arguments: { sessionId, filter: "errors" },
    });
    const errorsData = parseToolResult(errorsResult);
    const errorEntries = errorsData.entries as Array<{
      url: string;
      status: number;
    }>;

    // All entries in errors filter must have status >= 400 or status === 0
    for (const entry of errorEntries) {
      expect(entry.status === 0 || entry.status >= 400).toBe(true);
    }

    // Note: Vite SPA fallback may serve index.html with 200 for /api/data,
    // in which case it won't appear in errors filter. That's correct behavior.
    // If /api/data returned 404, it should be in errorEntries.
    if (apiEntry && (apiEntry.status === 0 || apiEntry.status >= 400)) {
      const apiInErrors = errorEntries.find((e) => e.url.includes("/api/data"));
      expect(apiInErrors).toBeDefined();
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
      name: "get_network_logs",
      arguments: { sessionId: newSessionId },
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.count).toBe(0);
    expect(data.note).toContain("No network logs captured yet");

    // Clean up new session
    await ctx.client.callTool({
      name: "end_session",
      arguments: { sessionId: newSessionId },
    });
  }, 30_000);
});
