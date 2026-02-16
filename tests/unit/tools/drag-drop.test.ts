import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15260;
const WEB_URL = `http://localhost:${PORT}`;

describe("drag_drop", () => {
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

  it("drags element to drop target and returns screenshot", async () => {
    const result = await ctx.client.callTool({
      name: "drag_drop",
      arguments: {
        sessionId,
        sourceSelector: "#drag-source",
        targetSelector: "#drop-target",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{
      type: string;
      text?: string;
      mimeType?: string;
    }>;
    const imageContent = content.find((c) => c.type === "image");
    expect(imageContent).toBeDefined();

    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
    expect(metadata.action).toBe("drag_drop");

    // Verify the drop actually happened by checking DOM state
    const evalResult = await ctx.client.callTool({
      name: "evaluate_javascript",
      arguments: {
        sessionId,
        expression:
          "document.getElementById('drag-status').textContent",
        pageIdentifier: WEB_URL,
      },
    });
    const evalData = parseToolResult(evalResult);
    expect(evalData.result).toBe("Drop successful");
  }, 30_000);

  it("returns error for nonexistent source element", async () => {
    const result = await ctx.client.callTool({
      name: "drag_drop",
      arguments: {
        sessionId,
        sourceSelector: "#nonexistent",
        targetSelector: "#drop-target",
        pageIdentifier: WEB_URL,
        timeout: 2000,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text.toLowerCase()).toContain("not found");
  }, 30_000);

  it("returns error for nonexistent target element", async () => {
    const result = await ctx.client.callTool({
      name: "drag_drop",
      arguments: {
        sessionId,
        sourceSelector: "#drag-source",
        targetSelector: "#nonexistent",
        pageIdentifier: WEB_URL,
        timeout: 2000,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text.toLowerCase()).toContain("not found");
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "drag_drop",
      arguments: {
        sessionId: "invalid-session-id",
        sourceSelector: "#drag-source",
        targetSelector: "#drop-target",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  }, 30_000);
});
