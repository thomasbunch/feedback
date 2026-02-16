import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("select_option", () => {
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

  it("selects option by value", async () => {
    const result = await ctx.client.callTool({
      name: "select_option",
      arguments: {
        sessionId,
        selector: "#color-select",
        value: "blue",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text?: string; mimeType?: string }>;
    const imageContent = content.find((c) => c.type === "image");
    expect(imageContent).toBeDefined();

    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
    expect(metadata.action).toBe("select");

    // Verify the selection took effect
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#color-select",
        pageIdentifier: WEB_URL,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.inputValue).toBe("blue");
  }, 30_000);

  it("selects option by label", async () => {
    const result = await ctx.client.callTool({
      name: "select_option",
      arguments: {
        sessionId,
        selector: "#color-select",
        label: "Red",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    // Verify the selection took effect
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#color-select",
        pageIdentifier: WEB_URL,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.inputValue).toBe("red");
  }, 30_000);

  it("selects option by index", async () => {
    const result = await ctx.client.callTool({
      name: "select_option",
      arguments: {
        sessionId,
        selector: "#color-select",
        index: 2,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    // Verify the selection took effect (index 2 = "Green")
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#color-select",
        pageIdentifier: WEB_URL,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.inputValue).toBe("green");
  }, 30_000);

  it("returns error when no selection method provided", async () => {
    const result = await ctx.client.callTool({
      name: "select_option",
      arguments: {
        sessionId,
        selector: "#color-select",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("exactly one");
  }, 30_000);

  it("returns error for non-select element", async () => {
    const result = await ctx.client.callTool({
      name: "select_option",
      arguments: {
        sessionId,
        selector: "#click-me",
        value: "test",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
