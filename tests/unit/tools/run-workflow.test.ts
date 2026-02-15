import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TestContext } from "../../helpers/mcp-test-client.js";
import { WEB_FIXTURE_DIR, WEB_PORT } from "../../helpers/fixtures.js";
import { parseToolResult } from "../../helpers/parse-tool-result.js";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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

  // ─── v1.2 Workflow Actions ──────────────────────────────────────────

  describe("v1.2 workflow actions", () => {
    it("executes select action", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "select", selector: "#color-select", value: "blue" },
            { action: "assert", selector: "#color-select", assertType: "value-equals", expected: "blue" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.completedSteps).toBe(3);
    }, 30_000);

    it("executes press action", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "type", selector: "#text-input", text: "" },
            { action: "click", selector: "#text-input" },
            { action: "press", key: "a" },
            { action: "assert", selector: "#text-input", assertType: "value-equals", expected: "a" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
    }, 30_000);

    it("executes hover action", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "hover", selector: "#hover-target" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const hoverStep = JSON.parse(stepTexts[1].text!);
      expect(hoverStep.action).toBe("hover");
      expect(hoverStep.success).toBe(true);
    }, 30_000);

    it("executes scroll action with direction", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "scroll", selector: "#scroll-container", direction: "down", amount: 200 },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const scrollStep = JSON.parse(stepTexts[1].text!);
      expect(scrollStep.action).toBe("scroll");
      expect(scrollStep.success).toBe(true);
    }, 30_000);

    it("executes evaluate action", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "evaluate", expression: "document.title = 'Changed'" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.completedSteps).toBe(2);
    }, 30_000);

    it("executes drag action", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "drag", sourceSelector: "#drag-source", targetSelector: "#drop-target" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const dragStep = JSON.parse(stepTexts[1].text!);
      expect(dragStep.action).toBe("drag");
      expect(dragStep.success).toBe(true);
    }, 30_000);

    it("executes upload action", async () => {
      // Create a temporary test file
      const tempFilePath = join(tmpdir(), "workflow-upload-test.txt");
      writeFileSync(tempFilePath, "test upload content");

      try {
        const result = await ctx.client.callTool({
          name: "run_workflow",
          arguments: {
            sessionId,
            steps: [
              { action: "navigate", url: WEB_URL },
              { action: "upload", selector: "#file-input", files: [tempFilePath] },
            ],
            pageIdentifier: WEB_URL,
          },
        });

        expect(result.isError).toBeFalsy();

        const { summary, stepTexts } = parseWorkflowResult(result);
        expect(summary.workflow).toBe("complete");

        const uploadStep = JSON.parse(stepTexts[1].text!);
        expect(uploadStep.action).toBe("upload");
        expect(uploadStep.success).toBe(true);
      } finally {
        try { unlinkSync(tempFilePath); } catch { /* ignore */ }
      }
    }, 30_000);

    it("validates select requires exactly one selection method", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "select", selector: "#color-select" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBe(true);

      const content = result.content as Array<{ type: string; text?: string }>;
      const errorText = content.find((c) => c.type === "text")?.text ?? "";
      expect(errorText).toContain("exactly one of");
    }, 30_000);

    it("validates drag requires sourceSelector and targetSelector", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "drag", sourceSelector: "#drag-source" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBe(true);

      const content = result.content as Array<{ type: string; text?: string }>;
      const errorText = content.find((c) => c.type === "text")?.text ?? "";
      expect(errorText).toContain("targetSelector");
    }, 30_000);
  });

  // ─── v1.2 Workflow Assertions ───────────────────────────────────────

  describe("v1.2 workflow assertions", () => {
    it("css-equals -- passes when CSS property matches", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", selector: "#css-test-element", assertType: "css-equals", property: "color", expected: "rgb(255, 0, 0)" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("css-equals");
    }, 30_000);

    it("css-equals -- fails when CSS property does not match", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", selector: "#css-test-element", assertType: "css-equals", property: "color", expected: "rgb(0, 0, 255)" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBe(true);

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("stopped");
      expect(summary.assertionsFailed).toBe(1);

      // The assert step is step index 1 (after navigate)
      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(false);
    }, 30_000);

    it("url-equals -- passes when URL matches", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", assertType: "url-equals", expected: WEB_URL + "/" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("url-equals");
    }, 30_000);

    it("url-contains -- passes when URL contains substring", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", assertType: "url-contains", expected: "localhost" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("url-contains");
    }, 30_000);

    it("title-equals -- passes when title matches", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", assertType: "title-equals", expected: "Test Fixture" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("title-equals");
    }, 30_000);

    it("count-equals -- passes when element count matches", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", selector: "#color-select option", assertType: "count-equals", expected: "4" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary, stepTexts } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");

      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.passed).toBe(true);
      expect(assertStep.assertion.assertType).toBe("count-equals");
    }, 30_000);

    it("a11y-passes -- scopes to selector and returns structured result", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", selector: "#a11y-good-section", assertType: "a11y-passes" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      // The section may have color-contrast violations from the red text,
      // so we verify structure rather than asserting pass
      const { stepTexts } = parseWorkflowResult(result);
      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.assertType).toBe("a11y-passes");
      expect(typeof assertStep.assertion.passed).toBe("boolean");
      expect(assertStep.assertion.expected).toBe("0 accessibility violations");
      // Selector should be scoped
      expect(assertStep.assertion.selector).toBe("#a11y-good-section");
    }, 30_000);

    it("a11y-passes -- works without selector (full page)", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "assert", assertType: "a11y-passes" },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      // Don't check pass/fail since full page may have a11y issues -- just verify structure
      const { stepTexts } = parseWorkflowResult(result);
      const assertStep = JSON.parse(stepTexts[1].text!);
      expect(assertStep.assertion.assertType).toBe("a11y-passes");
      expect(typeof assertStep.assertion.passed).toBe("boolean");
    }, 30_000);

    it("multi-step workflow combining v1.2 actions and assertions", async () => {
      const result = await ctx.client.callTool({
        name: "run_workflow",
        arguments: {
          sessionId,
          steps: [
            { action: "navigate", url: WEB_URL },
            { action: "select", selector: "#color-select", value: "green" },
            { action: "assert", selector: "#color-select", assertType: "value-equals", expected: "green" },
            { action: "hover", selector: "#hover-target" },
            { action: "assert", assertType: "url-contains", expected: "localhost" },
            { action: "scroll", direction: "down", amount: 100 },
          ],
          pageIdentifier: WEB_URL,
        },
      });

      expect(result.isError).toBeFalsy();

      const { summary } = parseWorkflowResult(result);
      expect(summary.workflow).toBe("complete");
      expect(summary.completedSteps).toBe(6);
    }, 30_000);
  });
});
