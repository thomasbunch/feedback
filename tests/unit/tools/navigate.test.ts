import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("navigate", () => {
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

  // Tests run sequentially -- each depends on prior navigation state
  // CRITICAL: navigate goto re-keys page ref from old URL to new URL.
  // back/forward do NOT re-key -- they keep the last goto key.

  it("navigates to a URL via goto", async () => {
    const result = await ctx.client.callTool({
      name: "navigate",
      arguments: {
        sessionId,
        action: "goto",
        url: `${WEB_URL}/page2.html`,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    // navigate returns 2 content items: text metadata + image
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content.length).toBe(2);

    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
    expect(metadata.url).toContain("page2.html");

    // After goto, the page ref key changed from WEB_URL to the new URL
    // Verify content by reading heading with the NEW page ref key
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#heading",
        pageIdentifier: `${WEB_URL}/page2.html`,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.textContent).toBe("Page 2");
  }, 30_000);

  it("navigates back in browser history", async () => {
    // Current page ref key is still WEB_URL/page2.html (from the goto above)
    // back/forward do NOT re-key the page reference
    const result = await ctx.client.callTool({
      name: "navigate",
      arguments: {
        sessionId,
        action: "back",
        pageIdentifier: `${WEB_URL}/page2.html`,
      },
    });

    expect(result.isError).toBeFalsy();

    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);

    // The browser went back to index page, but page ref key is UNCHANGED
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#heading",
        pageIdentifier: `${WEB_URL}/page2.html`,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.textContent).toBe("Hello Fixture");
  }, 30_000);

  it("navigates forward in browser history", async () => {
    // Page ref key still WEB_URL/page2.html (back did not re-key)
    const result = await ctx.client.callTool({
      name: "navigate",
      arguments: {
        sessionId,
        action: "forward",
        pageIdentifier: `${WEB_URL}/page2.html`,
      },
    });

    expect(result.isError).toBeFalsy();

    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);

    // Forward brought us back to page2
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#heading",
        pageIdentifier: `${WEB_URL}/page2.html`,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.textContent).toBe("Page 2");
  }, 30_000);

  it("returns error for goto without URL", async () => {
    const result = await ctx.client.callTool({
      name: "navigate",
      arguments: {
        sessionId,
        action: "goto",
        pageIdentifier: `${WEB_URL}/page2.html`,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("URL is required");
  }, 30_000);
});
