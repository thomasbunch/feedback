import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sharp from "sharp";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15240;
const WEB_URL = `http://localhost:${PORT}`;

/**
 * Extract the base64 image data from an MCP tool result containing image content
 */
function extractImageBase64(result: { content: unknown }): string {
  const content = result.content as Array<{
    type: string;
    data?: string;
  }>;
  const imageEntry = content.find((c) => c.type === "image");
  if (!imageEntry?.data) throw new Error("No image content in result");
  return imageEntry.data;
}

/**
 * Create a solid-color WebP image as base64
 */
async function createSolidImage(
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): Promise<string> {
  const buf = await sharp({
    create: { width, height, channels: 4, background: { ...color, alpha: 1 } },
  })
    .webp({ quality: 80 })
    .toBuffer();
  return buf.toString("base64");
}

describe("compare_screenshots", () => {
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

  it("compares identical screenshots with 0% mismatch", async () => {
    // Take two screenshots of the same page state (both re-navigate, producing identical output)
    const ss1 = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url: WEB_URL },
    });
    expect(ss1.isError).toBeFalsy();
    const img1 = extractImageBase64(ss1);

    const ss2 = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url: WEB_URL },
    });
    expect(ss2.isError).toBeFalsy();
    const img2 = extractImageBase64(ss2);

    // Compare
    const result = await ctx.client.callTool({
      name: "compare_screenshots",
      arguments: { sessionId, image1: img1, image2: img2 },
    });

    expect(result.isError).toBeFalsy();

    // Verify text metadata
    const data = parseToolResult(result);
    expect(data.mismatchPercentage).toBe(0);
    expect(data.match).toBe(true);
    expect(data.dimensions).toBeDefined();
    const dims = data.dimensions as { width: number; height: number };
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);

    // Verify diff image is present
    const diffImg = extractImageBase64(result);
    expect(diffImg.length).toBeGreaterThan(0);
  }, 30_000);

  it("detects differences between two images", async () => {
    // Create two visually distinct synthetic images
    const whiteImage = await createSolidImage(200, 200, { r: 255, g: 255, b: 255 });
    const redImage = await createSolidImage(200, 200, { r: 255, g: 0, b: 0 });

    // Compare
    const result = await ctx.client.callTool({
      name: "compare_screenshots",
      arguments: { sessionId, image1: whiteImage, image2: redImage, threshold: 0 },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.mismatchPercentage).toBeGreaterThan(0);
    expect(data.mismatchPixels).toBeGreaterThan(0);
    expect(data.match).toBe(false);

    // Diff image should be present
    const diffImg = extractImageBase64(result);
    expect(diffImg.length).toBeGreaterThan(0);
  }, 30_000);

  it("returns error for dimension mismatch", async () => {
    // Create two images with different dimensions
    const small = await createSolidImage(100, 100, { r: 255, g: 255, b: 255 });
    const large = await createSolidImage(200, 200, { r: 255, g: 255, b: 255 });

    // Compare -- should error due to dimension mismatch
    const result = await ctx.client.callTool({
      name: "compare_screenshots",
      arguments: { sessionId, image1: small, image2: large },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text.toLowerCase()).toContain("dimensions");
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "compare_screenshots",
      arguments: {
        sessionId: "invalid",
        image1: "AAAA",
        image2: "AAAA",
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);

  it("supports threshold parameter", async () => {
    // Create two slightly different images (near-white vs white)
    const white = await createSolidImage(200, 200, { r: 255, g: 255, b: 255 });
    const nearWhite = await createSolidImage(200, 200, { r: 250, g: 250, b: 250 });

    // Compare with very tolerant threshold (should find fewer mismatches)
    const tolerantResult = await ctx.client.callTool({
      name: "compare_screenshots",
      arguments: {
        sessionId,
        image1: white,
        image2: nearWhite,
        threshold: 1.0,
      },
    });
    expect(tolerantResult.isError).toBeFalsy();
    const tolerantData = parseToolResult(tolerantResult);

    // Compare with strict threshold (should find more mismatches)
    const strictResult = await ctx.client.callTool({
      name: "compare_screenshots",
      arguments: {
        sessionId,
        image1: white,
        image2: nearWhite,
        threshold: 0,
      },
    });
    expect(strictResult.isError).toBeFalsy();
    const strictData = parseToolResult(strictResult);

    // Tolerant threshold should have fewer or equal mismatches
    expect(
      (tolerantData.mismatchPercentage as number) <=
        (strictData.mismatchPercentage as number)
    ).toBe(true);
  }, 30_000);
});
