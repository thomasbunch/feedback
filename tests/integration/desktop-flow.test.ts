/**
 * Integration test: Desktop (Windows exe) tool flow
 * Exercises: create_session -> launch_windows_exe -> check_port ->
 *            get_process_output -> stop_process -> end_session
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { createTestClient, TestContext } from "../helpers/mcp-test-client.js";
import { WIN_FIXTURE_DIR, WIN_PORT } from "../helpers/fixtures.js";
import { parseToolResult } from "../helpers/parse-tool-result.js";

describe("Desktop flow integration", () => {
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
    sessionId = sessionData.sessionId as string;
    expect(sessionId).toBeTruthy();

    // Launch Windows fixture (node.exe running server.js)
    const serverPath = path.join(WIN_FIXTURE_DIR, "server.js");
    const launchResult = await ctx.client.callTool({
      name: "launch_windows_exe",
      arguments: {
        sessionId,
        exePath: process.execPath, // node.exe
        args: [serverPath],
        cwd: WIN_FIXTURE_DIR,
      },
    });
    const launchData = parseToolResult(launchResult);
    expect(launchData.pid).toBeDefined();
    expect(launchData.status).toBe("running");

    // Give the server a moment to start listening
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 30_000);

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

  it("tracks process and can stop it", async () => {
    // Verify port is occupied
    const portCheckBefore = await ctx.client.callTool({
      name: "check_port",
      arguments: { port: WIN_PORT },
    });
    const portDataBefore = parseToolResult(portCheckBefore);
    expect(portDataBefore.available).toBe(false);

    // Stop all processes in session
    const stopResult = await ctx.client.callTool({
      name: "stop_process",
      arguments: { sessionId },
    });
    const stopData = parseToolResult(stopResult);
    expect(stopData.stopped).toBe(true);

    // Wait for port to be released
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify port is free
    const portCheckAfter = await ctx.client.callTool({
      name: "check_port",
      arguments: { port: WIN_PORT },
    });
    const portDataAfter = parseToolResult(portCheckAfter);
    expect(portDataAfter.available).toBe(true);

    // Session was destroyed by stop_process, so clear sessionId to skip end_session in afterAll
    sessionId = "";
  }, 30_000);

  it("captures process output", async () => {
    // NOTE: This test runs after stop_process destroyed the session above.
    // We need a fresh session to test process output capture.
    const sessionResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const sessionData = parseToolResult(sessionResult);
    const newSessionId = sessionData.sessionId as string;

    try {
      // Launch the server again
      const serverPath = path.join(WIN_FIXTURE_DIR, "server.js");
      const launchResult = await ctx.client.callTool({
        name: "launch_windows_exe",
        arguments: {
          sessionId: newSessionId,
          exePath: process.execPath,
          args: [serverPath],
          cwd: WIN_FIXTURE_DIR,
        },
      });
      const launchData = parseToolResult(launchResult);
      expect(launchData.pid).toBeDefined();

      // Wait for server to start and produce output
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get process output
      const outputResult = await ctx.client.callTool({
        name: "get_process_output",
        arguments: { sessionId: newSessionId },
      });
      const outputData = parseToolResult(outputResult);
      const entries = outputData.entries as Array<Record<string, unknown>>;
      expect(entries).toBeDefined();
      expect(entries.length).toBeGreaterThan(0);

      // Check for expected stdout message
      const texts = entries.map(
        (e) => (e.text as string) ?? (e.data as string) ?? ""
      );
      const hasListeningMsg = texts.some((t: string) =>
        t.includes(`Win fixture listening on ${WIN_PORT}`)
      );
      expect(hasListeningMsg).toBe(true);
    } finally {
      // Clean up the new session
      try {
        await ctx.client.callTool({
          name: "end_session",
          arguments: { sessionId: newSessionId },
        });
      } catch {
        // Best-effort cleanup
      }
    }
  }, 30_000);
});
