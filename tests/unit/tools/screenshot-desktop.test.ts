import { spawn, ChildProcess } from "child_process";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";

/** Parse the JSON text from an MCP tool result */
function parseToolResult(result: { content: unknown }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  const textEntry = content.find((c) => c.type === "text");
  if (!textEntry) throw new Error("No text content in tool result");
  return JSON.parse(textEntry.text);
}

describe("screenshot_desktop", () => {
  let ctx: TestContext;
  let sessionId: string;
  let notepadProcess: ChildProcess;
  let notepadPid: number;

  beforeAll(async () => {
    ctx = await createTestClient();

    // Create session
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const createData = parseToolResult(createResult);
    sessionId = createData.sessionId as string;

    // Spawn notepad.exe directly (bypasses launch_windows_exe which has
    // vitest fork pool compatibility issues with GUI apps)
    notepadProcess = spawn("C:/Windows/System32/notepad.exe", [], {
      stdio: "ignore",
      detached: true,
      windowsHide: false,
    });
    notepadProcess.unref();

    if (!notepadProcess.pid) {
      throw new Error("Failed to spawn notepad.exe");
    }
    notepadPid = notepadProcess.pid;

    // Wait for notepad window to appear
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 30_000);

  afterAll(async () => {
    // Kill notepad
    try {
      if (notepadProcess && notepadProcess.exitCode === null) {
        process.kill(notepadPid);
      }
    } catch {
      // Ignore cleanup errors
    }
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

  it("captures a desktop window screenshot by PID", async () => {
    const result = await ctx.client.callTool({
      name: "screenshot_desktop",
      arguments: {
        sessionId,
        pid: notepadPid,
      },
    });

    expect(result.isError).toBeFalsy();

    const content = result.content as any[];
    expect(content.length).toBe(2);

    // Parse metadata from first content item (text)
    const metadata = JSON.parse(content[0].text);
    expect(metadata.type).toBe("desktop");
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

    // Notepad window should have real content
    expect(imageBuffer.length).toBeGreaterThan(500);
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "screenshot_desktop",
      arguments: {
        sessionId: "bad-id",
        pid: 99999,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Session not found");
  });

  it("returns error for nonexistent PID", async () => {
    const result = await ctx.client.callTool({
      name: "screenshot_desktop",
      arguments: {
        sessionId,
        pid: 99999,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/Failed|Could not find|No window found/);
  }, 15_000);
});
