/**
 * Workflow step executor
 * Sequentially runs actions against a Playwright page with per-step
 * screenshot capture and console/error log delta tracking.
 *
 * Stop-on-error semantics: failed steps still capture screenshot and
 * log deltas for debugging context, then execution halts.
 */

import type { Page } from "playwright";
import type { SessionManager } from "../session-manager.js";
import type { ConsoleEntry, ErrorEntry } from "../capture/types.js";
import type { WorkflowStep, StepResult, WorkflowResult } from "./types.js";
import { resolveSelector } from "../interaction/selectors.js";
import { capturePlaywrightPage } from "../screenshot/capture.js";
import { optimizeScreenshot } from "../screenshot/optimize.js";
import { evaluateAssertion } from "./assertions.js";
import { existsSync } from "fs";
import { resolve } from "path";

/**
 * Validate a workflow step has all required fields for its action type.
 *
 * @param step - The workflow step to validate
 * @param index - Zero-based step index (for error messages)
 * @returns null if valid, or a descriptive error string
 */
export function validateStep(step: WorkflowStep, index: number): string | null {
  switch (step.action) {
    case "click":
      if (!step.selector) {
        return `Step ${index}: 'click' requires a 'selector' field`;
      }
      break;
    case "type":
      if (!step.selector) {
        return `Step ${index}: 'type' requires a 'selector' field`;
      }
      if (step.text === undefined || step.text === null) {
        return `Step ${index}: 'type' requires a 'text' field`;
      }
      break;
    case "navigate":
      if (!step.url) {
        return `Step ${index}: 'navigate' requires a 'url' field`;
      }
      break;
    case "wait":
      if (!step.selector) {
        return `Step ${index}: 'wait' requires a 'selector' field`;
      }
      break;
    case "screenshot":
      // No required fields
      break;
    case "select": {
      if (!step.selector) {
        return `Step ${index}: 'select' requires a 'selector' field`;
      }
      const methods = [step.value !== undefined, step.label !== undefined, step.index !== undefined];
      const count = methods.filter(Boolean).length;
      if (count !== 1) {
        return `Step ${index}: 'select' requires exactly one of 'value', 'label', or 'index'`;
      }
      break;
    }
    case "press":
      if (!step.key) {
        return `Step ${index}: 'press' requires a 'key' field`;
      }
      break;
    case "hover":
      if (!step.selector) {
        return `Step ${index}: 'hover' requires a 'selector' field`;
      }
      break;
    case "scroll":
      if (!step.selector && !step.direction && !step.scrollTo) {
        return `Step ${index}: 'scroll' requires at least one of 'selector', 'direction', or 'scrollTo'`;
      }
      break;
    case "evaluate":
      if (!step.expression) {
        return `Step ${index}: 'evaluate' requires an 'expression' field`;
      }
      break;
    case "upload": {
      if (!step.selector) {
        return `Step ${index}: 'upload' requires a 'selector' field`;
      }
      if (!step.files || step.files.length === 0) {
        return `Step ${index}: 'upload' requires a non-empty 'files' array`;
      }
      break;
    }
    case "drag": {
      if (!step.sourceSelector) {
        return `Step ${index}: 'drag' requires a 'sourceSelector' field`;
      }
      if (!step.targetSelector) {
        return `Step ${index}: 'drag' requires a 'targetSelector' field`;
      }
      break;
    }
    case "assert": {
      if (!step.assertType) {
        return `Step ${index}: 'assert' requires an 'assertType' field`;
      }
      const pageLevelAssertions = ["url-equals", "url-contains", "title-equals", "a11y-passes"];
      if (!pageLevelAssertions.includes(step.assertType) && !step.selector) {
        return `Step ${index}: 'assert' requires a 'selector' field`;
      }
      const needsExpected = [
        "text-equals", "text-contains", "value-equals", "attribute-equals",
        "css-equals", "url-equals", "url-contains", "title-equals", "count-equals",
      ];
      if (needsExpected.includes(step.assertType) && step.expected === undefined) {
        return `Step ${index}: '${step.assertType}' assertion requires an 'expected' field`;
      }
      const needsAttribute = ["has-attribute", "attribute-equals"];
      if (needsAttribute.includes(step.assertType) && !step.attribute) {
        return `Step ${index}: '${step.assertType}' assertion requires an 'attribute' field`;
      }
      if (step.assertType === "css-equals" && !step.property) {
        return `Step ${index}: 'css-equals' assertion requires a 'property' field`;
      }
      break;
    }
    default:
      return `Step ${index}: unknown action '${(step as any).action}'`;
  }
  return null;
}

/**
 * Execute a workflow — sequential steps against a Playwright page.
 *
 * Each step: validate -> execute action -> capture screenshot -> capture log deltas.
 * On error: capture screenshot + log deltas for debugging, then stop.
 *
 * @returns WorkflowResult with per-step results, counts, and optional failedStep index
 */
export async function executeWorkflow(params: {
  page: Page;
  steps: WorkflowStep[];
  sessionManager: SessionManager;
  sessionId: string;
  pageIdentifier: string;
}): Promise<WorkflowResult> {
  const { page, steps, sessionManager, sessionId } = params;
  let pageIdentifier = params.pageIdentifier;

  const results: StepResult[] = [];
  let lastConsoleCount = 0;
  let lastErrorCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const result: StepResult = {
      stepIndex: i,
      action: step.action,
      success: false,
      timestamp: new Date().toISOString(),
      consoleDelta: [],
      errorDelta: [],
    };

    // Validate step before execution
    const validationError = validateStep(step, i);
    if (validationError) {
      result.error = validationError;
      results.push(result);
      break;
    }

    try {
      // Execute action via switch dispatch
      switch (step.action) {
        case "click": {
          const locator = resolveSelector(page, step.selector!);
          await locator.click({
            button: step.button ?? undefined,
            clickCount: step.clickCount ?? undefined,
            timeout: step.timeout ?? 30000,
          });
          // Post-click stability wait (matches click-element.ts pattern)
          await Promise.race([
            page.waitForLoadState("load").catch(() => {}),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)),
          ]);
          break;
        }

        case "type": {
          const locator = resolveSelector(page, step.selector!);
          const effectiveTimeout = step.timeout ?? 30000;

          if (step.pressSequentially) {
            // Clear first, then type char-by-char
            await locator.fill("", { timeout: effectiveTimeout });
            await locator.pressSequentially(step.text!, {
              delay: 50,
              timeout: effectiveTimeout,
            });
          } else if (step.clear === false) {
            // Append mode: click to focus, then insertText
            await locator.click({ timeout: effectiveTimeout });
            await page.keyboard.insertText(step.text!);
          } else {
            // Default: fill() clears and types in one step
            await locator.fill(step.text!, { timeout: effectiveTimeout });
          }
          break;
        }

        case "navigate": {
          await page.goto(step.url!, {
            waitUntil: "load",
            timeout: step.timeout ?? 30000,
          });

          // Update PageReference URL (matches navigate.ts lines 120-128)
          const oldRef = sessionManager.getPageRef(sessionId, pageIdentifier);
          if (oldRef) {
            sessionManager.removePageRef(sessionId, pageIdentifier);
            sessionManager.setPageRef(sessionId, step.url!, {
              ...oldRef,
              url: step.url!,
            });
          }
          // Update local identifier for subsequent steps
          pageIdentifier = step.url!;
          break;
        }

        case "screenshot": {
          // No-op: screenshot is captured in the post-step phase below
          break;
        }

        case "wait": {
          const locator = resolveSelector(page, step.selector!);
          await locator.waitFor({
            state: step.state ?? "visible",
            timeout: step.timeout ?? 30000,
          });
          break;
        }

        case "select": {
          const locator = resolveSelector(page, step.selector!);
          if (step.value !== undefined) {
            await locator.selectOption({ value: step.value }, { timeout: step.timeout ?? 30000 });
          } else if (step.label !== undefined) {
            await locator.selectOption({ label: step.label }, { timeout: step.timeout ?? 30000 });
          } else {
            await locator.selectOption({ index: step.index! }, { timeout: step.timeout ?? 30000 });
          }
          break;
        }

        case "press": {
          if (step.selector) {
            const locator = resolveSelector(page, step.selector);
            await locator.press(step.key!, { timeout: step.timeout ?? 30000 });
          } else {
            await page.keyboard.press(step.key!);
          }
          break;
        }

        case "hover": {
          const locator = resolveSelector(page, step.selector!);
          await locator.hover({
            position: step.position ?? undefined,
            force: step.force ?? undefined,
            timeout: step.timeout ?? 30000,
          });
          break;
        }

        case "scroll": {
          if (step.direction) {
            // Direction-based scrolling via mouse.wheel
            const amt = step.amount ?? 500;
            let deltaX = 0;
            let deltaY = 0;
            switch (step.direction) {
              case "down":
                deltaY = amt;
                break;
              case "up":
                deltaY = -amt;
                break;
              case "right":
                deltaX = amt;
                break;
              case "left":
                deltaX = -amt;
                break;
            }
            if (step.selector) {
              // Scroll within element: hover first to position mouse over it
              const locator = resolveSelector(page, step.selector);
              await locator.hover({ timeout: step.timeout ?? 30000 });
            }
            await page.mouse.wheel(deltaX, deltaY);
            // Allow scroll to settle
            await new Promise<void>((r) => setTimeout(r, 200));
          } else if (step.scrollTo) {
            // Absolute scroll position
            if (step.selector) {
              const locator = resolveSelector(page, step.selector);
              await locator.evaluate((el, pos) => {
                el.scrollTop = pos === "top" ? 0 : el.scrollHeight;
              }, step.scrollTo);
            } else {
              await page.evaluate((pos) => {
                window.scrollTo({ top: pos === "top" ? 0 : document.body.scrollHeight });
              }, step.scrollTo);
            }
            await new Promise<void>((r) => setTimeout(r, 200));
          } else if (step.selector) {
            // Scroll element into view
            const locator = resolveSelector(page, step.selector);
            await locator.scrollIntoViewIfNeeded({ timeout: step.timeout ?? 30000 });
          }
          break;
        }

        case "evaluate": {
          await page.evaluate(step.expression!);
          break;
        }

        case "upload": {
          // Validate all files exist before attempting upload
          for (const filePath of step.files!) {
            const resolved = resolve(filePath);
            if (!existsSync(resolved)) {
              throw new Error(`File not found: ${resolved}`);
            }
          }
          const locator = resolveSelector(page, step.selector!);
          await locator.setInputFiles(step.files!, { timeout: step.timeout ?? 30000 });
          break;
        }

        case "drag": {
          const sourceLocator = resolveSelector(page, step.sourceSelector!);
          const targetLocator = resolveSelector(page, step.targetSelector!);
          await sourceLocator.dragTo(targetLocator, {
            sourcePosition: step.sourcePosition ?? undefined,
            targetPosition: step.targetPosition ?? undefined,
          });
          // Post-drag stability wait
          await new Promise<void>((r) => setTimeout(r, 500));
          break;
        }

        case "assert": {
          const effectiveTimeout = step.timeout ?? 30000;
          const assertionResult = await evaluateAssertion(page, step, effectiveTimeout);
          result.assertion = assertionResult;

          if (!assertionResult.passed) {
            // Failed assertion: capture screenshot + log deltas, then stop workflow
            const rawBuffer = await capturePlaywrightPage(page, { fullPage: step.fullPage ?? false });
            const optimized = await optimizeScreenshot(rawBuffer, { maxWidth: 1024, quality: 60 });
            result.screenshotBase64 = optimized.data.toString("base64");
            result.screenshotMimeType = optimized.mimeType;

            // Capture log deltas
            const allConsole = sessionManager.getConsoleCollectors(sessionId).flatMap((c) => [...c.getEntries()]);
            const allErrors = sessionManager.getErrorCollectors(sessionId).flatMap((c) => [...c.getEntries()]);
            result.consoleDelta = allConsole.slice(lastConsoleCount);
            result.errorDelta = allErrors.slice(lastErrorCount);
            lastConsoleCount = allConsole.length;
            lastErrorCount = allErrors.length;

            results.push(result);
            break; // Break out of switch
          }
          break; // Switch break for passed assertions (falls through to normal screenshot/log capture)
        }
      }

      // Stop-on-error for failed assertions
      if (step.action === "assert" && result.assertion && !result.assertion.passed) {
        break; // Break the for loop
      }

      // Capture screenshot (aggressive optimization for workflows)
      const rawBuffer = await capturePlaywrightPage(page, {
        fullPage: step.fullPage ?? false,
      });
      const optimized = await optimizeScreenshot(rawBuffer, {
        maxWidth: 1024,
        quality: 60,
      });
      result.screenshotBase64 = optimized.data.toString("base64");
      result.screenshotMimeType = optimized.mimeType;

      // Capture log deltas (spread copy for mutation safety)
      const allConsole = sessionManager
        .getConsoleCollectors(sessionId)
        .flatMap((c) => [...c.getEntries()]);
      const allErrors = sessionManager
        .getErrorCollectors(sessionId)
        .flatMap((c) => [...c.getEntries()]);

      result.consoleDelta = allConsole.slice(lastConsoleCount);
      result.errorDelta = allErrors.slice(lastErrorCount);
      lastConsoleCount = allConsole.length;
      lastErrorCount = allErrors.length;

      result.success = true;
      results.push(result);
    } catch (error) {
      // Set error message
      result.error =
        error instanceof Error ? error.message : String(error);

      // Best-effort screenshot capture on failure
      try {
        const rawBuffer = await capturePlaywrightPage(page, {
          fullPage: step.fullPage ?? false,
        });
        const optimized = await optimizeScreenshot(rawBuffer, {
          maxWidth: 1024,
          quality: 60,
        });
        result.screenshotBase64 = optimized.data.toString("base64");
        result.screenshotMimeType = optimized.mimeType;
      } catch {
        // Silently skip if screenshot capture fails
      }

      // Still capture log deltas for debugging context
      try {
        const allConsole = sessionManager
          .getConsoleCollectors(sessionId)
          .flatMap((c) => [...c.getEntries()]);
        const allErrors = sessionManager
          .getErrorCollectors(sessionId)
          .flatMap((c) => [...c.getEntries()]);

        result.consoleDelta = allConsole.slice(lastConsoleCount);
        result.errorDelta = allErrors.slice(lastErrorCount);
        lastConsoleCount = allConsole.length;
        lastErrorCount = allErrors.length;
      } catch {
        // Silently skip if log capture fails
      }

      results.push(result);
      break; // Stop-on-error: halt after first failure
    }
  }

  // Build workflow result
  const completedSteps = results.filter((r) => r.success).length;
  const failedResult = results.find((r) => !r.success);

  return {
    steps: results,
    totalSteps: steps.length,
    completedSteps,
    failedStep: failedResult ? failedResult.stepIndex : undefined,
  };
}
