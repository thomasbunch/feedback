import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";

describe("get_version", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestClient();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("returns server version and capabilities", async () => {
    const result = await ctx.client.callTool({
      name: "get_version",
      arguments: {},
    });

    // Result should have content array with a text entry
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);

    const textContent = (result.content as Array<{ type: string; text: string }>).find(
      (c) => c.type === "text"
    );
    expect(textContent).toBeDefined();

    const data = JSON.parse(textContent!.text);
    expect(data.name).toBe("feedback");
    expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(data.status).toBe("ready");
    expect(Array.isArray(data.capabilities)).toBe(true);
    expect(data.capabilities.length).toBeGreaterThan(0);
  });
});
