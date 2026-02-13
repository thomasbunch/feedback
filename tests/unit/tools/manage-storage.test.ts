import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15210;
const WEB_URL = `http://localhost:${PORT}`;

describe("manage_storage", () => {
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

  it("sets and gets localStorage item", async () => {
    const setResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "localStorage",
        key: "testKey",
        value: "testValue",
        pageIdentifier: WEB_URL,
      },
    });

    expect(setResult.isError).toBeFalsy();
    const setData = parseToolResult(setResult);
    expect(setData.set).toBe(true);

    const getResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get",
        storageType: "localStorage",
        key: "testKey",
        pageIdentifier: WEB_URL,
      },
    });

    expect(getResult.isError).toBeFalsy();
    const getData = parseToolResult(getResult);
    expect(getData.value).toBe("testValue");
    expect(getData.found).toBe(true);
  }, 30_000);

  it("deletes localStorage item", async () => {
    // Set an item
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "localStorage",
        key: "toDelete",
        value: "xxx",
        pageIdentifier: WEB_URL,
      },
    });

    // Delete it
    const deleteResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "delete",
        storageType: "localStorage",
        key: "toDelete",
        pageIdentifier: WEB_URL,
      },
    });
    expect(deleteResult.isError).toBeFalsy();
    const deleteData = parseToolResult(deleteResult);
    expect(deleteData.deleted).toBe(true);

    // Verify it's gone
    const getResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get",
        storageType: "localStorage",
        key: "toDelete",
        pageIdentifier: WEB_URL,
      },
    });
    expect(getResult.isError).toBeFalsy();
    const getData = parseToolResult(getResult);
    expect(getData.found).toBe(false);
  }, 30_000);

  it("clears localStorage", async () => {
    // Set an item
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "localStorage",
        key: "key1",
        value: "v1",
        pageIdentifier: WEB_URL,
      },
    });

    // Clear all
    const clearResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "clear",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });
    expect(clearResult.isError).toBeFalsy();
    const clearData = parseToolResult(clearResult);
    expect(clearData.cleared).toBe(true);

    // Verify empty
    const getAllResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get_all",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });
    expect(getAllResult.isError).toBeFalsy();
    const getAllData = parseToolResult(getAllResult);
    expect(getAllData.count).toBe(0);
  }, 30_000);

  it("get_all localStorage", async () => {
    // Clear first to ensure clean state
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "clear",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });

    // Set two items
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "localStorage",
        key: "a",
        value: "1",
        pageIdentifier: WEB_URL,
      },
    });
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "localStorage",
        key: "b",
        value: "2",
        pageIdentifier: WEB_URL,
      },
    });

    const getAllResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get_all",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });
    expect(getAllResult.isError).toBeFalsy();
    const data = parseToolResult(getAllResult);
    expect(data.count).toBeGreaterThanOrEqual(2);
    const items = data.items as Record<string, string>;
    expect(items.a).toBe("1");
    expect(items.b).toBe("2");
  }, 30_000);

  it("sets and gets sessionStorage item", async () => {
    const setResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "sessionStorage",
        key: "sessKey",
        value: "sessVal",
        pageIdentifier: WEB_URL,
      },
    });
    expect(setResult.isError).toBeFalsy();
    const setData = parseToolResult(setResult);
    expect(setData.set).toBe(true);

    const getResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get",
        storageType: "sessionStorage",
        key: "sessKey",
        pageIdentifier: WEB_URL,
      },
    });
    expect(getResult.isError).toBeFalsy();
    const getData = parseToolResult(getResult);
    expect(getData.value).toBe("sessVal");
    expect(getData.found).toBe(true);
  }, 30_000);

  it("sets and gets a cookie", async () => {
    const setResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "cookies",
        key: "testCookie",
        value: "cookieValue",
        pageIdentifier: WEB_URL,
      },
    });
    expect(setResult.isError).toBeFalsy();
    const setData = parseToolResult(setResult);
    expect(setData.set).toBe(true);

    const getResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get",
        storageType: "cookies",
        key: "testCookie",
        pageIdentifier: WEB_URL,
      },
    });
    expect(getResult.isError).toBeFalsy();
    const getData = parseToolResult(getResult);
    expect(getData.found).toBe(true);
    const cookie = getData.cookie as Record<string, unknown>;
    expect(cookie.value).toBe("cookieValue");
  }, 30_000);

  it("clears cookies", async () => {
    // Set a cookie first
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "cookies",
        key: "toClear",
        value: "val",
        pageIdentifier: WEB_URL,
      },
    });

    // Clear all cookies
    const clearResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "clear",
        storageType: "cookies",
        pageIdentifier: WEB_URL,
      },
    });
    expect(clearResult.isError).toBeFalsy();
    const clearData = parseToolResult(clearResult);
    expect(clearData.cleared).toBe(true);

    // Verify cleared
    const getAllResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get_all",
        storageType: "cookies",
        pageIdentifier: WEB_URL,
      },
    });
    expect(getAllResult.isError).toBeFalsy();
    const getAllData = parseToolResult(getAllResult);
    expect(getAllData.count).toBe(0);
  }, 30_000);

  it("saves and restores localStorage state", async () => {
    // Clear and set known state
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "clear",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "localStorage",
        key: "persist1",
        value: "val1",
        pageIdentifier: WEB_URL,
      },
    });
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "localStorage",
        key: "persist2",
        value: "val2",
        pageIdentifier: WEB_URL,
      },
    });

    // Save state
    const saveResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "save",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });
    expect(saveResult.isError).toBeFalsy();
    const saveData = parseToolResult(saveResult);
    const savedState = saveData.state as string;
    expect(savedState).toBeDefined();

    // Clear localStorage
    await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "clear",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });

    // Verify cleared
    const emptyResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get_all",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });
    const emptyData = parseToolResult(emptyResult);
    expect(emptyData.count).toBe(0);

    // Restore state
    const restoreResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "restore",
        storageType: "localStorage",
        state: savedState,
        pageIdentifier: WEB_URL,
      },
    });
    expect(restoreResult.isError).toBeFalsy();
    const restoreData = parseToolResult(restoreResult);
    expect(restoreData.restored).toBe(true);
    expect(restoreData.count).toBe(2);

    // Verify both keys are back
    const getAllResult = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get_all",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });
    expect(getAllResult.isError).toBeFalsy();
    const getAllData = parseToolResult(getAllResult);
    const items = getAllData.items as Record<string, string>;
    expect(items.persist1).toBe("val1");
    expect(items.persist2).toBe("val2");
  }, 30_000);

  it("returns error when key missing for get", async () => {
    const result = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "get",
        storageType: "localStorage",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);

  it("returns error when key or value missing for set", async () => {
    const result = await ctx.client.callTool({
      name: "manage_storage",
      arguments: {
        sessionId,
        action: "set",
        storageType: "localStorage",
        key: "noValue",
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
