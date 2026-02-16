import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = WEB_PORT + 21; // 15121 — unique port for this test suite

describe("file_upload", () => {
  let ctx: TestContext;
  let sessionId: string;
  let tempDir: string;
  let testFilePath: string;
  const url = `http://localhost:${PORT}`;

  beforeAll(async () => {
    ctx = await createTestClient();

    // Create temporary test files
    tempDir = mkdtempSync(join(tmpdir(), "feedback-test-"));
    testFilePath = join(tempDir, "test-upload.txt");
    writeFileSync(testFilePath, "test file content");

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

    // Establish page ref via screenshot_web
    const ssResult = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url },
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

    // Clean up temp files
    try {
      unlinkSync(testFilePath);
      rmdirSync(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }, 30_000);

  it("uploads a single file", async () => {
    const result = await ctx.client.callTool({
      name: "file_upload",
      arguments: {
        sessionId,
        pageIdentifier: url,
        selector: "#file-input",
        files: [testFilePath],
      },
    });

    expect(result.isError).toBeFalsy();

    // Verify screenshot was returned
    const content = result.content as any[];
    const imageContent = content.find((c: any) => c.type === "image");
    expect(imageContent).toBeDefined();

    // Verify the file was accepted by checking file-status element
    const stateResult = await ctx.client.callTool({
      name: "get_element_state",
      arguments: {
        sessionId,
        pageIdentifier: url,
        selector: "#file-status",
      },
    });
    expect(stateResult.isError).toBeFalsy();
    const stateData = parseToolResult(stateResult);
    expect(stateData.textContent as string).toContain("test-upload.txt");
  }, 30_000);

  it("returns error for nonexistent file", async () => {
    const result = await ctx.client.callTool({
      name: "file_upload",
      arguments: {
        sessionId,
        pageIdentifier: url,
        selector: "#file-input",
        files: ["/nonexistent/path/file.txt"],
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("not found");
  });

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "file_upload",
      arguments: {
        sessionId: "invalid",
        selector: "#file-input",
        files: [testFilePath],
      },
    });

    expect(result.isError).toBe(true);
  });
});
