/**
 * Session management tool tests
 * Tests: get_version, create_session, list_sessions, end_session
 * Verifies: SESS-01 through SESS-04
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Parse JSON from MCP tool result, throw if isError */
function parseToolResult(result: { isError?: boolean; content: unknown }): Record<string, unknown> {
  if (result.isError) {
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "Unknown error";
    throw new Error(`Tool returned error: ${text}`);
  }
  const textContent = (result.content as Array<{ type: string; text: string }>).find(
    (c) => c.type === "text"
  );
  if (!textContent) throw new Error("No text content in result");
  return JSON.parse(textContent.text);
}

describe("Session Management Tools", () => {
  let ctx: TestContext;
  let sessionIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestClient();
  });

  afterEach(async () => {
    // Clean up any sessions created during the test
    for (const id of sessionIds) {
      try {
        await ctx.client.callTool({ name: "end_session", arguments: { sessionId: id } });
      } catch {
        // Ignore cleanup errors
      }
    }
    sessionIds = [];
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // SESS-01: get_version
  describe("get_version", () => {
    it("returns correct version matching package.json", async () => {
      const pkgPath = resolve(__dirname, "../../../package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

      const result = await ctx.client.callTool({ name: "get_version", arguments: {} });
      const data = parseToolResult(result);

      expect(data.name).toBe("feedback");
      expect(data.version).toBe(pkg.version);
      expect(data.status).toBe("ready");
      expect(Array.isArray(data.capabilities)).toBe(true);

      const caps = data.capabilities as string[];
      expect(caps).toContain("process_lifecycle");
      expect(caps).toContain("screenshots");
      expect(caps).toContain("interactions");
      expect(caps).toContain("error_capture");
      expect(caps).toContain("workflows");
      expect(caps).toContain("assertions");
    });
  });

  // SESS-02: create_session
  describe("create_session", () => {
    it("returns a UUID session ID", async () => {
      const result = await ctx.client.callTool({ name: "create_session", arguments: {} });
      const data = parseToolResult(result);

      expect(data.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(data.created).toBe(true);

      sessionIds.push(data.sessionId as string);
    });

    it("creates unique sessions", async () => {
      const result1 = await ctx.client.callTool({ name: "create_session", arguments: {} });
      const data1 = parseToolResult(result1);

      const result2 = await ctx.client.callTool({ name: "create_session", arguments: {} });
      const data2 = parseToolResult(result2);

      expect(data1.sessionId).not.toBe(data2.sessionId);

      sessionIds.push(data1.sessionId as string, data2.sessionId as string);
    });
  });

  // SESS-03: list_sessions
  describe("list_sessions", () => {
    it("returns empty list when no sessions exist", async () => {
      const result = await ctx.client.callTool({ name: "list_sessions", arguments: {} });
      const data = parseToolResult(result);

      expect(data.sessions).toEqual([]);
      expect(data.count).toBe(0);
    });

    it("shows created sessions", async () => {
      const r1 = await ctx.client.callTool({ name: "create_session", arguments: {} });
      const d1 = parseToolResult(r1);
      sessionIds.push(d1.sessionId as string);

      const r2 = await ctx.client.callTool({ name: "create_session", arguments: {} });
      const d2 = parseToolResult(r2);
      sessionIds.push(d2.sessionId as string);

      const result = await ctx.client.callTool({ name: "list_sessions", arguments: {} });
      const data = parseToolResult(result);

      const sessions = data.sessions as string[];
      expect(sessions).toContain(d1.sessionId);
      expect(sessions).toContain(d2.sessionId);
      expect(data.count).toBe(2);
    });
  });

  // SESS-04: end_session
  describe("end_session", () => {
    it("ends session and returns ended:true", async () => {
      const createResult = await ctx.client.callTool({ name: "create_session", arguments: {} });
      const createData = parseToolResult(createResult);
      const sessionId = createData.sessionId as string;

      const endResult = await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
      const endData = parseToolResult(endResult);

      expect(endData.ended).toBe(true);
      // Don't add to sessionIds since we already ended it
    });

    it("ended session no longer appears in list_sessions", async () => {
      const createResult = await ctx.client.callTool({ name: "create_session", arguments: {} });
      const createData = parseToolResult(createResult);
      const sessionId = createData.sessionId as string;

      await ctx.client.callTool({ name: "end_session", arguments: { sessionId } });

      const listResult = await ctx.client.callTool({ name: "list_sessions", arguments: {} });
      const listData = parseToolResult(listResult);

      const sessions = listData.sessions as string[];
      expect(sessions).not.toContain(sessionId);
    });

    it("returns error for nonexistent session", async () => {
      const result = await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId: "nonexistent-id" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Session not found");
    });

    it("returns error when ending already-ended session", async () => {
      const createResult = await ctx.client.callTool({ name: "create_session", arguments: {} });
      const createData = parseToolResult(createResult);
      const sessionId = createData.sessionId as string;

      // First end succeeds
      await ctx.client.callTool({ name: "end_session", arguments: { sessionId } });

      // Second end should fail
      const secondEnd = await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });

      expect(secondEnd.isError).toBe(true);
      const text = (secondEnd.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Session not found");
    });
  });
});
