/**
 * Integration test: Electron tool flow
 * Exercises: create_session -> launch_electron -> screenshot_electron ->
 *            click_element -> get_element_state -> end_session
 *
 * NOTE: Electron screenshot is known broken (see PROJECT.md).
 * Tests are written to fail clearly so they can be fixed in Phase 11.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { createTestClient, TestContext } from "../helpers/mcp-test-client.js";
import { ELECTRON_FIXTURE_DIR } from "../helpers/fixtures.js";

/** Parse the text content from an MCP tool result */
function parseToolResult(result: any): any {
  if (result.isError) {
    const errorText = result.content?.[0]?.text ?? "Unknown error";
    throw new Error(`Tool returned error: ${errorText}`);
  }
  const text = result.content?.[0]?.text;
  if (!text) throw new Error("No text content in tool result");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe("Electron flow integration", () => {
  let ctx: TestContext;
  let sessionId: string;

  beforeAll(async () => {
    ctx = await createTestClient();

    // Create session
    const sessionResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const sessionData = parseToolResult(sessionResult);
    sessionId = sessionData.sessionId;
    expect(sessionId).toBeTruthy();

    // Launch Electron app
    const entryPath = path.join(ELECTRON_FIXTURE_DIR, "main.js");
    const launchResult = await ctx.client.callTool({
      name: "launch_electron",
      arguments: {
        sessionId,
        entryPath,
      },
    });
    const launchData = parseToolResult(launchResult);
    expect(launchData.status).toBe("ready");
  }, 60_000);

  afterAll(async () => {
    try {
      if (sessionId) {
        await ctx.client.callTool({
          name: "end_session",
          arguments: { sessionId },
        });
      }
    } catch {
      // Cleanup must not throw
    }
    try {
      await ctx.cleanup();
    } catch {
      // Cleanup must not throw
    }
  }, 30_000);

  it("takes screenshot of Electron app", async () => {
    const result = await ctx.client.callTool({
      name: "screenshot_electron",
      arguments: {
        sessionId,
      },
    });

    // Should have image content
    const content = result.content as any[];
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThanOrEqual(1);

    const hasImage = content.some((item: any) => item.type === "image");
    expect(hasImage).toBe(true);
  }, 30_000);

  it("clicks button in Electron app", async () => {
    // Click the button
    const clickResult = await ctx.client.callTool({
      name: "click_element",
      arguments: {
        sessionId,
        selector: "#click-me",
        pageIdentifier: "electron",
      },
    });
    if ((clickResult as any).isError) {
      throw new Error(
        `click_element failed: ${(clickResult as any).content?.[0]?.text}`
      );
    }

    // Verify output
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        selector: "#output",
        pageIdentifier: "electron",
      },
    });
    const stateData = parseToolResult(stateResult);
    expect(stateData.textContent).toContain("Clicked!");
  }, 30_000);
});
