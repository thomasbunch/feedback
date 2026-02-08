import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("type_text", () => {
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

  it("types text using fill mode (default)", async () => {
    const result = await ctx.client.callTool({
      name: "type_text",
      arguments: {
        sessionId,
        selector: "#text-input",
        text: "Hello World",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content.length).toBe(2);

    const metadata = parseToolResult(result);
    expect(metadata.mode).toBe("fill");
    expect(metadata.success).toBe(true);

    // Verify typed text appears in the input
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#text-input",
        pageIdentifier: WEB_URL,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.inputValue).toBe("Hello World");
  }, 30_000);

  it("types text using pressSequentially mode", async () => {
    const result = await ctx.client.callTool({
      name: "type_text",
      arguments: {
        sessionId,
        selector: "#text-input",
        text: "abc",
        pressSequentially: true,
        delay: 10,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const metadata = parseToolResult(result);
    expect(metadata.mode).toBe("pressSequentially");
    expect(metadata.success).toBe(true);

    // Verify input value
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#text-input",
        pageIdentifier: WEB_URL,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.inputValue).toBe("abc");
  }, 30_000);

  it("clear defaults to true (replaces existing text)", async () => {
    // First, type "initial" via fill
    await ctx.client.callTool({
      name: "type_text",
      arguments: {
        sessionId,
        selector: "#text-input",
        text: "initial",
        pageIdentifier: WEB_URL,
      },
    });

    // Then type "replaced" via fill (clear defaults to true)
    await ctx.client.callTool({
      name: "type_text",
      arguments: {
        sessionId,
        selector: "#text-input",
        text: "replaced",
        pageIdentifier: WEB_URL,
      },
    });

    // Verify inputValue is "replaced", NOT "initialreplaced"
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#text-input",
        pageIdentifier: WEB_URL,
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const state = parseToolResult(stateResult);
    expect(state.inputValue).toBe("replaced");
  }, 30_000);

  it("returns error for non-editable element", async () => {
    const result = await ctx.client.callTool({
      name: "type_text",
      arguments: {
        sessionId,
        selector: "#heading",
        text: "test",
        pageIdentifier: WEB_URL,
        timeout: 2000,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    // Should indicate the element is not a text input or not editable
    expect(text.length).toBeGreaterThan(0);
  }, 30_000);
});
