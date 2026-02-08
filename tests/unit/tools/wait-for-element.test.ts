import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("wait_for_element", () => {
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

  it("waits for element to become visible", async () => {
    // #hidden-element starts with display:none
    // Concurrently: wait for it to become visible AND click the show button
    const [waitResult] = await Promise.all([
      ctx.client.callTool({
        name: "wait_for_element",
        arguments: {
          sessionId,
          selector: "#hidden-element",
          state: "visible",
          timeout: 5000,
          pageIdentifier: WEB_URL,
        },
      }),
      // Small delay then click to trigger visibility change
      new Promise<void>((resolve) => setTimeout(resolve, 500)).then(() =>
        ctx.client.callTool({
          name: "click_element",
          arguments: {
            sessionId,
            selector: "#show-hidden",
            pageIdentifier: WEB_URL,
          },
        })
      ),
    ]);

    expect(waitResult.isError).toBeFalsy();

    // wait_for_element returns 2 content items (text + image)
    const content = waitResult.content as Array<{ type: string }>;
    expect(content.length).toBe(2);

    const metadata = parseToolResult(waitResult);
    expect(metadata.success).toBe(true);
    expect(metadata.state).toBe("visible");
  }, 30_000);

  it("waits for element already attached", async () => {
    // #heading already exists in the DOM, so state="attached" resolves immediately
    const result = await ctx.client.callTool({
      name: "wait_for_element",
      arguments: {
        sessionId,
        selector: "#heading",
        state: "attached",
        timeout: 5000,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const metadata = parseToolResult(result);
    expect(metadata.success).toBe(true);
  }, 30_000);

  it("times out when element does not reach state", async () => {
    const result = await ctx.client.callTool({
      name: "wait_for_element",
      arguments: {
        sessionId,
        selector: "#nonexistent-element",
        state: "visible",
        timeout: 1000,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text.toLowerCase()).toContain("did not reach state");
  }, 30_000);
});
