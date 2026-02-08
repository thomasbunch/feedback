import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("get_element_state", () => {
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

  it("reads text content and inner text", async () => {
    const result = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#heading",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    // get_element_state returns 1 content item (text JSON only, NO image)
    const content = result.content as Array<{ type: string }>;
    expect(content.length).toBe(1);
    expect(content[0].type).toBe("text");

    const state = parseToolResult(result);
    expect(state.textContent).toBe("Hello Fixture");
    expect(state.innerText).toBe("Hello Fixture");
  }, 30_000);

  it("detects visible element", async () => {
    const result = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#heading",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const state = parseToolResult(result);
    expect(state.visible).toBe(true);
    expect(state.enabled).toBe(true);
  }, 30_000);

  it("detects hidden element", async () => {
    const result = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#hidden-element",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const state = parseToolResult(result);
    expect(state.visible).toBe(false);
    expect(state.textContent).toBe("Hidden");
  }, 30_000);

  it("reads element attributes", async () => {
    const result = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#text-input",
        attributes: ["type", "placeholder"],
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const state = parseToolResult(result);
    const attrs = state.attributes as Record<string, string>;
    expect(attrs.type).toBe("text");
    expect(attrs.placeholder).toBe("Type here");
  }, 30_000);

  it("reads input value", async () => {
    const result = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#text-input",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const state = parseToolResult(result);
    expect(typeof state.inputValue).toBe("string");
  }, 30_000);

  it("returns error for nonexistent element", async () => {
    const result = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#nonexistent",
        pageIdentifier: WEB_URL,
        timeout: 2000,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Element not found");
  }, 30_000);
});
