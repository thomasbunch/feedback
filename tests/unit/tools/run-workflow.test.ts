import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";

/**
 * Parse multi-content workflow result into summary, step metadata, and step images.
 */
function parseWorkflowResult(result: { content: unknown }) {
  const content = result.content as Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;

  // First text entry is the summary
  const allTexts = content.filter((c) => c.type === "text");
  const summary = JSON.parse(allTexts[0].text!) as Record<string, unknown>;

  // Remaining text entries are per-step metadata
  const stepTexts = allTexts.slice(1);

  // Image entries are per-step screenshots
  const stepImages = content.filter((c) => c.type === "image");

  return { summary, stepTexts, stepImages };
}

const WEB_URL = `http://localhost:${WEB_PORT}`;

describe("run_workflow", () => {
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
        args: ["vite", "--port", String(WEB_PORT)],
        cwd: WEB_FIXTURE_DIR,
        port: WEB_PORT,
        timeoutMs: 30000,
      },
    });
    expect(launchResult.isError).toBeFalsy();

    // Take screenshot to establish browser + page ref + attach collectors
    const ssResult = await ctx.client.callTool({
      name: "screenshot_web",
      arguments: { sessionId, url: WEB_URL },
    });
    expect(ssResult.isError).toBeFalsy();

    // Wait for page stabilization
    await new Promise((resolve) => setTimeout(resolve, 1000));
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

  // ─── WKFL-01: Workflow Steps ────────────────────────────────────────

  describe("workflow steps", () => {
    it("executes click + screenshot workflow", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "click", selector: "#click-me" },
            { action: "screenshot" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts, stepImages } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.totalSteps).toBe(2);
      expect(summary.completedSteps).toBe(2);
      expect(summary.failedAtStep).toBeUndefined();

      // 2 step metadata entries
      expect(stepTexts.length).toBe(2);
      // At least 1 screenshot image (screenshot step)
      expect(stepImages.length).toBeGreaterThanOrEqual(1);

      // Step 0 metadata
      const step0 = JSON.parse(stepTexts[0].text!);
      expect(step0.action).toBe("click");
      expect(step0.success).toBe(true);
    }, 30_000);

    it("executes type step", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [{ action: "type", selector: "#text-input", text: "workflow test" }],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.completedSteps).toBe(1);

      const { stepTexts } = parseWorkflowResult(result);
      const step0 = JSON.parse(stepTexts[0].text!);
      expect(step0.action).toBe("type");
      expect(step0.success).toBe(true);
    }, 30_000);

    it("executes wait step", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "click", selector: "#show-hidden" },
            { action: "wait", selector: "#hidden-element", state: "visible", timeout: 5000 },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.completedSteps).toBe(2);
    }, 30_000);

    it("executes navigate step", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [{ action: "navigate", url: WEB_URL }],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.completedSteps).toBe(1);
    }, 30_000);

    it("stops on error for invalid step", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [{ action: "click", selector: "#nonexistent", timeout: 2000 }],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBe(true);

      const { summary } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("stopped");
      expect(summary.failedAtStep).toBe(0);
    }, 30_000);
  });

  // ─── WKFL-02: Workflow Assertions ─────────────────────────────────

  describe("workflow assertions", () => {
    it("exists -- passes when element exists", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [{ action: "assert", selector: "#heading", assertType: "exists" }],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.assertionsPassed).toBe(1);
      expect(summary.assertionsFailed).toBe(0);

      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("exists");
    }, 30_000);

    it("not-exists -- passes when element does not exist", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [{ action: "assert", selector: "#nonexistent", assertType: "not-exists" }],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("not-exists");
    }, 30_000);

    it("visible -- passes when element is visible", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [{ action: "assert", selector: "#heading", assertType: "visible" }],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { stepTexts } = parseWorkflowResult(result);
      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("visible");
    }, 30_000);

    it("hidden -- passes when element is hidden", async () => {
      // Navigate first to reset page state (show-hidden was clicked earlier)
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", selector: "#hidden-element", assertType: "hidden" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.completedSteps).toBe(2);

      // The assert step is the second step (index 1)
      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("hidden");
    }, 30_000);

    it("text-equals -- passes when text matches", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "assert", selector: "#heading", assertType: "text-equals", expected: "Hello Fixture" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { stepTexts } = parseWorkflowResult(result);
      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("text-equals");
    }, 30_000);

    it("text-equals -- fails when text does not match", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "assert", selector: "#heading", assertType: "text-equals", expected: "Wrong Text" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBe(true);

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("stopped");
      expect(summary.assertionsFailed).toBe(1);

      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(false);
    }, 30_000);

    it("text-contains -- passes when text includes substring", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "assert", selector: "#heading", assertType: "text-contains", expected: "Hello" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { stepTexts } = parseWorkflowResult(result);
      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("text-contains");
    }, 30_000);

    it("has-attribute -- passes when attribute present", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "assert", selector: "#text-input", assertType: "has-attribute", attribute: "placeholder" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { stepTexts } = parseWorkflowResult(result);
      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("has-attribute");
    }, 30_000);

    it("attribute-equals -- passes when attribute matches value", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "assert", selector: "#text-input", assertType: "attribute-equals", attribute: "type", expected: "text" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { stepTexts } = parseWorkflowResult(result);
      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("attribute-equals");
    }, 30_000);

    it("enabled -- passes when element is enabled", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "assert", selector: "#click-me", assertType: "enabled" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { stepTexts } = parseWorkflowResult(result);
      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("enabled");
    }, 30_000);

    it("disabled -- passes when element is disabled", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "assert", selector: "#disabled-btn", assertType: "disabled" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { stepTexts } = parseWorkflowResult(result);
      const stepMeta = JSON.parse(stepTexts[0].text!);
      expect(stepMeta.assertion.passed).toBe(true);
      expect(stepMeta.assertion.assertType).toBe("disabled");
    }, 30_000);

    it("checked -- passes when checkbox is checked", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "click", selector: "#test-checkbox" },
            { action: "assert", selector: "#test-checkbox", assertType: "checked" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      // Assert step is second (index 1)
      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("checked");
    }, 30_000);

    it("not-checked -- passes when checkbox is unchecked", async () => {
      // Navigate to reset checkbox state, then assert
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", selector: "#test-checkbox", assertType: "not-checked" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.completedSteps).toBe(2);

      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("not-checked");
    }, 30_000);

    it("value-equals -- passes when input value matches", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "type", selector: "#text-input", text: "hello" },
            { action: "assert", selector: "#text-input", assertType: "value-equals", expected: "hello" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("value-equals");
    }, 30_000);

    it("stops workflow on failed assertion", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "assert", selector: "#heading", assertType: "text-equals", expected: "Wrong" },
            { action: "click", selector: "#click-me" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBe(true);

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("stopped");
      expect(summary.failedAtStep).toBe(0);
      expect(summary.totalSteps).toBe(2);

      // Only 1 step result exists (second step never executed)
      expect(stepTexts.length).toBe(1);
    }, 30_000);
  });
});
