/**
 * Integration test: Web tool flow
 * Exercises: create_session -> launch_web_server -> screenshot_web ->
 *            click_element -> get_element_state -> get_console_logs -> end_session
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../helpers/fixtures.js";

/** Parse the text content from an MCP tool result */
function parseToolResult(result: any): any {
  if (result.isError) {
    const errorText = result.content?.[0]?.text ?? "Unknown error";
    throw new Error(`Tool returned error: ${errorText}`);
  }
  const text = result.content?.[0]?.text;
  if (!text) throw new Error("No text content in tool result");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe("Web flow integration", () => {
  let ctx: TestContext;
  let sessionId: string;

  beforeAll(async () => {
    // Create MCP client
    ctx = await createTestClient();

    // Create session
    const sessionResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const sessionData = parseToolResult(sessionResult);
    sessionId = sessionData.sessionId;
    expect(sessionId).toBeTruthy();

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
    const launchData = parseToolResult(launchResult);
    expect(launchData.status).toBe("ready");
  }, 60_000);

  afterAll(async () => {
    try {
      if (sessionId) {
        await ctx.client.callTool({
          name: "end_session",
          arguments: { sessionId },
        });
      }
    } catch {
      // Cleanup must not throw
    }
    try {
      await ctx.cleanup();
    } catch {
      // Cleanup must not throw
    }
  }, 30_000);

  it("takes a screenshot of the web page", async () => {
    const result = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: {
        sessionId,
        url: `http://localhost:${WEB_PORT}`,
      },
    });

    // screenshot_web returns text metadata + image content
    expect(result.content).toBeDefined();
    const content = result.content as any[];
    expect(content.length).toBeGreaterThanOrEqual(2);

    const hasImage = content.some((item: any) => item.type === "image");
    expect(hasImage).toBe(true);
  }, 30_000);

  it("clicks a button and verifies result", async () => {
    // Click the button
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#click-me",
      },
    });
    // click_element returns a screenshot (should not be an error)
    if ((clickResult as any).isError) {
      throw new Error(
        `click_element failed: ${(clickResult as any).content?.[0]?.text}`
      );
    }

    // Verify the output element was updated
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#output",
      },
    });
    const stateData = parseToolResult(stateResult);
    expect(stateData.text).toContain("Button was clicked!");
  }, 30_000);

  it("captures console logs", async () => {
    const result = await ctx.client.callTool({
      name: "get_console_logs",
      arguments: {
        sessionId,
      },
    });
    const data = parseToolResult(result);
    expect(data.entries).toBeDefined();
    expect(data.entries.length).toBeGreaterThan(0);

    // The fixture logs "Fixture app loaded" on startup
    const messages = data.entries.map((e: any) => e.text ?? e.message ?? "");
    const hasFixtureLog = messages.some((m: string) =>
      m.includes("Fixture app loaded")
    );
    expect(hasFixtureLog).toBe(true);
  }, 30_000);
});
