import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

const PORT = 15220;
const WEB_URL = `http://localhost:${PORT}`;

describe("audit_accessibility", () => {
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

  it("detects accessibility violations", async () => {
    const result = await ctx.client.callTool({
      name: "audit_accessibility",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);
    expect(data.violationCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.violations)).toBe(true);
    expect(data.summary).toBeDefined();

    const summary = data.summary as Record<string, number>;
    expect(typeof summary.violations).toBe("number");
    expect(typeof summary.passes).toBe("number");
    expect(typeof summary.incomplete).toBe("number");
    expect(typeof summary.inapplicable).toBe("number");
  }, 30_000);

  it("returns violation details with help and affected elements", async () => {
    const result = await ctx.client.callTool({
      name: "audit_accessibility",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);

    const violations = data.violations as Array<Record<string, unknown>>;
    expect(violations.length).toBeGreaterThanOrEqual(1);

    // Check the first violation has expected fields
    const violation = violations[0];
    expect(violation.id).toBeDefined();
    expect(violation.impact).toBeDefined();
    expect(violation.description).toBeDefined();
    expect(violation.help).toBeDefined();
    expect(violation.helpUrl).toBeDefined();
    expect(violation.tags).toBeDefined();
    expect(Array.isArray(violation.affectedElements)).toBe(true);

    // Check affected element structure
    const elements = violation.affectedElements as Array<Record<string, unknown>>;
    expect(elements.length).toBeGreaterThanOrEqual(1);
    const element = elements[0];
    expect(element.html).toBeDefined();
    expect(element.target).toBeDefined();
    expect(element.impact).toBeDefined();
  }, 30_000);

  it("supports tag filtering", async () => {
    const result = await ctx.client.callTool({
      name: "audit_accessibility",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
        tags: ["wcag2a"],
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result);

    // Result shape should be correct regardless of violation count
    expect(typeof data.violationCount).toBe("number");
    expect(Array.isArray(data.violations)).toBe(true);
    expect(data.summary).toBeDefined();
  }, 30_000);

  it("supports include/exclude selectors", async () => {
    // Include only the a11y test section
    const includeResult = await ctx.client.callTool({
      name: "audit_accessibility",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
        include: "#a11y-test-section",
      },
    });

    expect(includeResult.isError).toBeFalsy();
    const includeData = parseToolResult(includeResult);
    const includedViolations = includeData.violationCount as number;

    // Exclude the a11y test section
    const excludeResult = await ctx.client.callTool({
      name: "audit_accessibility",
      arguments: {
        sessionId,
        pageIdentifier: WEB_URL,
        exclude: "#a11y-test-section",
      },
    });

    expect(excludeResult.isError).toBeFalsy();
    const excludeData = parseToolResult(excludeResult);

    // Both results should have valid shape
    expect(typeof includeData.violationCount).toBe("number");
    expect(typeof excludeData.violationCount).toBe("number");

    // The included section has intentional violations, so should find some
    expect(includedViolations).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("returns error for invalid session", async () => {
    const result = await ctx.client.callTool({
      name: "audit_accessibility",
      arguments: {
        sessionId: "invalid",
      },
    });

    expect(result.isError).toBe(true);
  }, 30_000);
});
