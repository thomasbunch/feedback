/**
 * MCP resource integration tests
 * Tests: resource listing, reading, dynamic updates, screenshot fallback
 * Verifies: MCPP-01 (MCP Resources via feedback:// URI scheme)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

describe("MCP Resources", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestClient();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("lists resource templates", async () => {
    const { resourceTemplates } = await ctx.client.listResourceTemplates();

    const uriTemplates = resourceTemplates.map((t) => t.uriTemplate);
    expect(uriTemplates).toContain(
      "feedback://sessions/{sessionId}/console-logs"
    );
    expect(uriTemplates).toContain(
      "feedback://sessions/{sessionId}/errors"
    );
    expect(uriTemplates).toContain(
      "feedback://sessions/{sessionId}/network-logs"
    );
    expect(uriTemplates).toContain(
      "feedback://sessions/{sessionId}/screenshot"
    );
    expect(uriTemplates).toContain(
      "feedback://sessions/{sessionId}/state"
    );
  }, 30_000);

  it("lists static sessions resource", async () => {
    const { resources } = await ctx.client.listResources();

    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("feedback://sessions");
  }, 30_000);

  it("reads sessions resource with no active sessions", async () => {
    const result = await ctx.client.readResource({
      uri: "feedback://sessions",
    });

    const text = (result.contents[0] as { text: string }).text;
    const data = JSON.parse(text);
    expect(data).toEqual([]);
  }, 30_000);

  it("reads sessions resource after creating a session", async () => {
    // Create a session
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const createData = parseToolResult(createResult);
    const sessionId = createData.sessionId as string;

    try {
      const result = await ctx.client.readResource({
        uri: "feedback://sessions",
      });

      const text = (result.contents[0] as { text: string }).text;
      const data = JSON.parse(text) as Array<{
        id: string;
        createdAt: string;
        resourceCount: number;
      }>;
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(sessionId);
      expect(data[0].createdAt).toBeDefined();
      expect(data[0].resourceCount).toBe(0);
    } finally {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
    }
  }, 30_000);

  it("reads console-logs for a session with no collectors", async () => {
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const createData = parseToolResult(createResult);
    const sessionId = createData.sessionId as string;

    try {
      const result = await ctx.client.readResource({
        uri: `feedback://sessions/${sessionId}/console-logs`,
      });

      const text = (result.contents[0] as { text: string }).text;
      const data = JSON.parse(text);
      expect(data).toEqual([]);
    } finally {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
    }
  }, 30_000);

  it("reads session state resource", async () => {
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const createData = parseToolResult(createResult);
    const sessionId = createData.sessionId as string;

    try {
      const result = await ctx.client.readResource({
        uri: `feedback://sessions/${sessionId}/state`,
      });

      const text = (result.contents[0] as { text: string }).text;
      const state = JSON.parse(text) as {
        id: string;
        createdAt: string;
        hasAutoCapture: boolean;
        pageRefs: string[];
        collectors: { console: number; error: number; network: number };
      };
      expect(state.id).toBe(sessionId);
      expect(state.createdAt).toBeDefined();
      expect(typeof state.createdAt).toBe("string");
      expect(state.hasAutoCapture).toBe(false);
      expect(state.pageRefs).toEqual([]);
      expect(state.collectors).toEqual({
        console: 0,
        error: 0,
        network: 0,
      });
    } finally {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
    }
  }, 30_000);

  it("resource list includes session-scoped entries after session creation", async () => {
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const createData = parseToolResult(createResult);
    const sessionId = createData.sessionId as string;

    try {
      const { resources } = await ctx.client.listResources();
      const uris = resources.map((r) => r.uri);

      // Template list callbacks should enumerate the new session
      expect(uris).toContain(
        `feedback://sessions/${sessionId}/console-logs`
      );
      expect(uris).toContain(
        `feedback://sessions/${sessionId}/errors`
      );
      expect(uris).toContain(
        `feedback://sessions/${sessionId}/network-logs`
      );
      expect(uris).toContain(
        `feedback://sessions/${sessionId}/state`
      );
    } finally {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
    }
  }, 30_000);

  it("screenshot resource returns no screenshot available when none captured", async () => {
    const createResult = await ctx.client.callTool({
      name: "create_session",
      arguments: {},
    });
    const createData = parseToolResult(createResult);
    const sessionId = createData.sessionId as string;

    try {
      const result = await ctx.client.readResource({
        uri: `feedback://sessions/${sessionId}/screenshot`,
      });

      const content = result.contents[0] as { text?: string; mimeType?: string };
      expect(content.text).toContain("No screenshot available");
    } finally {
      await ctx.client.callTool({
        name: "end_session",
        arguments: { sessionId },
      });
    }
  }, 30_000);
});
