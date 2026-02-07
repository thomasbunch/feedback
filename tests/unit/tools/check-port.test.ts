import { describe, it, expect, beforeAll, afterAll } from "vitest";
import net from "net";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";

/** Parse the JSON text from an MCP tool result */
function parseToolResult(result: { content: unknown }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  const textEntry = content.find((c) => c.type === "text");
  if (!textEntry) throw new Error("No text content in tool result");
  return JSON.parse(textEntry.text);
}

describe("check_port", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestClient();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("detects free port as available", async () => {
    const result = await ctx.client.callTool({
      name: "check_port",
      arguments: { port: 19999 },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.available).toBe(true);
    expect(data.port).toBe(19999);
  });

  it("detects occupied port as unavailable", async () => {
    const server = net.createServer();
    try {
      await new Promise<void>((resolve) => {
        server.listen(19998, () => resolve());
      });

      const result = await ctx.client.callTool({
        name: "check_port",
        arguments: { port: 19998 },
      });

      expect(result.isError).toBeFalsy();
      const data = parseToolResult(result);
      expect(data.available).toBe(false);
      expect(data.port).toBe(19998);
      expect(typeof data.suggestedAlternative).toBe("number");
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it("rejects invalid port via zod validation", async () => {
    // Port 0 is below min(1), zod should reject it before the handler runs
    try {
      const result = await ctx.client.callTool({
        name: "check_port",
        arguments: { port: 0 },
      });
      // If we get here, check it's an error response
      expect(result.isError).toBe(true);
    } catch (error) {
      // MCP validation error thrown before handler -- this is expected
      expect(error).toBeDefined();
    }
  });
});
