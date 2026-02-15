import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15270;
const WEB_URL = `http://localhost:${PORT}`;

describe("intercept_network", () => {
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

  it("adds a mock route and intercepts request", async () => {
    // Add mock route for /api/mock-target
    const addResult = await ctx.client.callTool({
      name: "intercept_network",
      arguments: {
        sessionId,
        action: "add_route",
        urlPattern: "**/api/mock-target",
        routeAction: "mock",
        mockResponse: {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ mocked: true, message: "intercepted" }),
        },
        pageIdentifier: WEB_URL,
      },
    });

    expect(addResult.isError).toBeFalsy();
    const addData = parseToolResult(addResult);
    expect(addData.action).toBe("add_route");
    expect(addData.active).toBe(true);

    // Click the fetch button to trigger the mocked request
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#fetch-mock-target",
        pageIdentifier: WEB_URL,
      },
    });
    expect(clickResult.isError).toBeFalsy();

    // Wait briefly for fetch to complete
    await new Promise((r) => setTimeout(r, 500));

    // Read the result from the DOM
    const evalResult = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression:
          "document.getElementById('fetch-mock-result').textContent",
        pageIdentifier: WEB_URL,
      },
    });
    expect(evalResult.isError).toBeFalsy();
    const evalData = parseToolResult(evalResult);
    const resultText = evalData.result as string;
    const parsed = JSON.parse(resultText);
    expect(parsed.mocked).toBe(true);
    expect(parsed.message).toBe("intercepted");
  }, 30_000);

  it("lists active routes", async () => {
    const listResult = await ctx.client.callTool({
      name: "intercept_network",
      arguments: {
        sessionId,
        action: "list_routes",
        pageIdentifier: WEB_URL,
      },
    });

    expect(listResult.isError).toBeFalsy();
    const listData = parseToolResult(listResult);
    expect(listData.count).toBeGreaterThanOrEqual(1);
    const routes = listData.routes as Array<{
      urlPattern: string;
      routeAction: string;
    }>;
    const mockRoute = routes.find((r) =>
      r.urlPattern.includes("api/mock-target")
    );
    expect(mockRoute).toBeDefined();
    expect(mockRoute!.routeAction).toBe("mock");
  }, 30_000);

  it("removes a specific route", async () => {
    const removeResult = await ctx.client.callTool({
      name: "intercept_network",
      arguments: {
        sessionId,
        action: "remove_route",
        urlPattern: "**/api/mock-target",
        pageIdentifier: WEB_URL,
      },
    });

    expect(removeResult.isError).toBeFalsy();
    const removeData = parseToolResult(removeResult);
    expect(removeData.removed).toBe(true);

    // Verify routes are empty
    const listResult = await ctx.client.callTool({
      name: "intercept_network",
      arguments: {
        sessionId,
        action: "list_routes",
        pageIdentifier: WEB_URL,
      },
    });
    expect(listResult.isError).toBeFalsy();
    const listData = parseToolResult(listResult);
    expect(listData.count).toBe(0);
  }, 30_000);

  it("blocks requests matching pattern", async () => {
    // Add block route
    const blockResult = await ctx.client.callTool({
      name: "intercept_network",
      arguments: {
        sessionId,
        action: "add_route",
        urlPattern: "**/api/mock-target",
        routeAction: "block",
        pageIdentifier: WEB_URL,
      },
    });
    expect(blockResult.isError).toBeFalsy();

    // Clear previous result text first
    await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression:
          "document.getElementById('fetch-mock-result').textContent = ''",
        pageIdentifier: WEB_URL,
      },
    });

    // Click the fetch button
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#fetch-mock-target",
        pageIdentifier: WEB_URL,
      },
    });
    expect(clickResult.isError).toBeFalsy();

    // Wait for fetch to fail
    await new Promise((r) => setTimeout(r, 1000));

    // Read the result -- should contain "Error"
    const evalResult = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression:
          "document.getElementById('fetch-mock-result').textContent",
        pageIdentifier: WEB_URL,
      },
    });
    expect(evalResult.isError).toBeFalsy();
    const evalData = parseToolResult(evalResult);
    const resultText = evalData.result as string;
    expect(resultText).toContain("Error");

    // Clean up: remove all routes
    const removeAllResult = await ctx.client.callTool({
      name: "intercept_network",
      arguments: {
        sessionId,
        action: "remove_all",
        pageIdentifier: WEB_URL,
      },
    });
    expect(removeAllResult.isError).toBeFalsy();
    const removeAllData = parseToolResult(removeAllResult);
    expect(removeAllData.removedCount).toBe(1);
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "intercept_network",
      arguments: {
        sessionId: "invalid-session-id",
        action: "list_routes",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Session not found");
  }, 30_000);

  it("returns error when urlPattern missing for add_route", async () => {
    const result = await ctx.client.callTool({
      name: "intercept_network",
      arguments: {
        sessionId,
        action: "add_route",
        routeAction: "mock",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("urlPattern");
  }, 30_000);
});
