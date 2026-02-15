import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15250;
const WEB_URL = `http://localhost:${PORT}`;

describe("get_css_property", () => {
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

  it("reads a single CSS property", async () => {
    const result = await ctx.client.callTool({
      name: "get_css_property",
      arguments: {
        sessionId,
        selector: "#css-test-element",
        property: "color",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.selector).toBe("#css-test-element");
    expect(data.properties).toBeDefined();
    const props = data.properties as Record<string, string>;
    expect(props.color).toBe("rgb(255, 0, 0)");
  }, 30_000);

  it("reads multiple CSS properties", async () => {
    const result = await ctx.client.callTool({
      name: "get_css_property",
      arguments: {
        sessionId,
        selector: "#css-test-element",
        properties: ["color", "font-size", "display"],
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    const props = data.properties as Record<string, string>;
    expect(props.color).toBe("rgb(255, 0, 0)");
    expect(props["font-size"]).toBe("20px");
    expect(props.display).toBe("block");
  }, 30_000);

  it("returns empty string for invalid CSS property", async () => {
    const result = await ctx.client.callTool({
      name: "get_css_property",
      arguments: {
        sessionId,
        selector: "#css-test-element",
        property: "not-a-real-property",
        pageIdentifier: WEB_URL,
      },
    });

    // Per CSS spec, invalid property names return empty string -- not an error
    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    const props = data.properties as Record<string, string>;
    expect(props["not-a-real-property"]).toBe("");
  }, 30_000);

  it("returns error when no property specified", async () => {
    const result = await ctx.client.callTool({
      name: "get_css_property",
      arguments: {
        sessionId,
        selector: "#css-test-element",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text.toLowerCase()).toContain("property");
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "get_css_property",
      arguments: {
        sessionId: "invalid",
        selector: "#css-test-element",
        property: "color",
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);

  it("returns error for non-existent element", async () => {
    const result = await ctx.client.callTool({
      name: "get_css_property",
      arguments: {
        sessionId,
        selector: "#does-not-exist",
        property: "color",
        pageIdentifier: WEB_URL,
        timeout: 2000,
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
