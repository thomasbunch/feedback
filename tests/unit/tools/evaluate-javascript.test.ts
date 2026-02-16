import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15170;
const WEB_URL = `http://localhost:${PORT}`;

describe("evaluate_javascript", () => {
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

  it("evaluates simple expression", async () => {
    const result = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "1 + 2",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.result).toBe(3);
    expect(data.resultType).toBe("number");
  }, 30_000);

  it("evaluates string expression", async () => {
    const result = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "document.title",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.result).toBe("Test Fixture");
    expect(data.resultType).toBe("string");
  }, 30_000);

  it("evaluates object expression", async () => {
    const result = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "({a: 1, b: 'hello'})",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.resultType).toBe("object");
    const resultObj = data.result as Record<string, unknown>;
    expect(resultObj.a).toBe(1);
    expect(resultObj.b).toBe("hello");
  }, 30_000);

  it("evaluates array expression", async () => {
    const result = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "[1, 2, 3]",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.resultType).toBe("array");
    expect(data.result).toEqual([1, 2, 3]);
  }, 30_000);

  it("handles DOM manipulation", async () => {
    // Change heading text
    const result = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression:
          "document.getElementById('heading').textContent = 'Changed'; 'done'",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.result).toBe("done");

    // Verify the change via get_page_content
    const contentResult = await ctx.client.callTool({
      name: "get_page_content",
      arguments: {
        sessionId,
        selector: "#heading",
        pageIdentifier: WEB_URL,
      },
    });
    expect(contentResult.isError).toBeFalsy();
    const contentData = parseToolResult(contentResult);
    expect(contentData.content).toContain("Changed");

    // Restore heading
    await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression:
          "document.getElementById('heading').textContent = 'Hello Fixture'; 'restored'",
        pageIdentifier: WEB_URL,
      },
    });
  }, 30_000);

  it("handles undefined result", async () => {
    const result = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "undefined",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.resultType).toBe("undefined");
    expect(data.note).toBeDefined();
  }, 30_000);

  it("returns error for invalid JavaScript", async () => {
    const result = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression: "this is not valid {{{ javascript",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(
      text.toLowerCase().includes("evaluation error") ||
        text.toLowerCase().includes("syntaxerror")
    ).toBe(true);
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId: "invalid",
        expression: "1",
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
