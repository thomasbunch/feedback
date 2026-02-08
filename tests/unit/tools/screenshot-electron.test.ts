import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { ELECTRON_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

describe("screenshot_electron", () => {
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

    // Launch Electron app
    const launchResult = await ctx.client.callTool({
      name: "launch_electron",
      arguments: {
        sessionId,
        entryPath: path.join(ELECTRON_FIXTURE_DIR, "main.js"),
      },
    });
    expect(launchResult.isError).toBeFalsy();
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

  it("captures an Electron app screenshot as WebP", async () => {
    const result = await ctx.client.callTool({
      name: "screenshot_electron",
      arguments: { sessionId },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as any[];
    expect(content.length).toBe(2);

    // Parse metadata from first content item (text)
    const metadata = JSON.parse(content[0].text);
    expect(metadata.type).toBe("electron");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);

    // Check image content
    const imageContent = content.find((c: any) => c.type === "image");
    expect(imageContent).toBeDefined();
    expect(imageContent.mimeType).toBe("image/webp");

    // Verify WebP header: RIFF....WEBP
    const imageBuffer = Buffer.from(imageContent.data, "base64");
    const riff = imageBuffer.subarray(0, 4).toString("ascii");
    const webp = imageBuffer.subarray(8, 12).toString("ascii");
    expect(riff).toBe("RIFF");
    expect(webp).toBe("WEBP");

    // Not a trivial/blank image
    expect(imageBuffer.length).toBeGreaterThan(1000);
  }, 30_000);

  it("captures full page Electron screenshot", async () => {
    const result = await ctx.client.callTool({
      name: "screenshot_electron",
      arguments: {
        sessionId,
        fullPage: true,
      },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as any[];
    expect(content.length).toBe(2);

    const metadata = JSON.parse(content[0].text);
    expect(metadata.mode).toContain("full");
  }, 30_000);

  it("returns error when no Electron app launched", async () => {
    // Create a fresh session with no Electron app
    const freshResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const freshData = parseToolResult(freshResult);
    const freshSessionId = freshData.sessionId as string;

    const result = await ctx.client.callTool({
      name: "screenshot_electron",
      arguments: { sessionId: freshSessionId },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("No Electron app found");

    // Clean up fresh session
    try {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId: freshSessionId },
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "screenshot_electron",
      arguments: { sessionId: "bad-id" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });
});
