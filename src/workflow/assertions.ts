/**
 * Assertion evaluation for workflow assert steps.
 * Queries element state via Playwright locator methods and returns
 * structured pass/fail results.
 */

import type { Page } from "playwright";
import type { WorkflowStep } from "./types.js";
import { resolveSelector } from "../interaction/selectors.js";

/**
 * Structured result of an assertion evaluation.
 */
export interface AssertionResult {
  passed: boolean;
  assertType: string;
  selector: string;
  expected: string | null;
  actual: string | null;
  message: string;
}

/**
 * Evaluate an assertion step against a Playwright page.
 *
 * Assertion failures produce { passed: false } results, NOT thrown exceptions.
 * Only unexpected errors (page crash, browser disconnect) propagate as throws.
 */
export async function evaluateAssertion(
  page: Page,
  step: WorkflowStep,
  timeout: number
): Promise<AssertionResult> {
  const base = {
    assertType: step.assertType!,
    selector: step.selector!,
  };

  const locator = resolveSelector(page, step.selector!);

  switch (step.assertType) {
    case "exists": {
      const count = await locator.count();
      const passed = count > 0;
      return {
        ...base,
        passed,
        expected: "element exists in DOM",
        actual: count > 0 ? `found (${count} match${count > 1 ? "es" : ""})` : "not found",
        message: passed
          ? `PASS: Element "${step.selector}" exists (${count} match${count > 1 ? "es" : ""})`
          : `FAIL: Element "${step.selector}" does not exist`,
      };
    }

    case "not-exists": {
      const count = await locator.count();
      const passed = count === 0;
      return {
        ...base,
        passed,
        expected: "element does not exist in DOM",
        actual: count === 0 ? "not found" : `found (${count} match${count > 1 ? "es" : ""})`,
        message: passed
          ? `PASS: Element "${step.selector}" does not exist`
          : `FAIL: Element "${step.selector}" exists (${count} match${count > 1 ? "es" : ""})`,
      };
    }

    case "visible": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is visible",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM (timeout waiting for attachment)`,
        };
      }
      const visible = await locator.isVisible();
      return {
        ...base,
        passed: visible,
        expected: "element is visible",
        actual: visible ? "visible" : "hidden",
        message: visible
          ? `PASS: Element "${step.selector}" is visible`
          : `FAIL: Element "${step.selector}" is hidden`,
      };
    }

    case "hidden": {
      const count = await locator.count();
      if (count === 0) {
        return {
          ...base,
          passed: true,
          expected: "element is hidden",
          actual: "not in DOM (hidden)",
          message: `PASS: Element "${step.selector}" is not in DOM (counts as hidden)`,
        };
      }
      const visible = await locator.isVisible();
      const passed = !visible;
      return {
        ...base,
        passed,
        expected: "element is hidden",
        actual: visible ? "visible" : "hidden",
        message: passed
          ? `PASS: Element "${step.selector}" is hidden`
          : `FAIL: Element "${step.selector}" is visible`,
      };
    }

    case "text-equals": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `text equals "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const text = (await locator.innerText({ timeout })).trim();
      const passed = text === step.expected;
      return {
        ...base,
        passed,
        expected: `text equals "${step.expected}"`,
        actual: `"${text}"`,
        message: passed
          ? `PASS: Text of "${step.selector}" equals "${step.expected}"`
          : `FAIL: Text of "${step.selector}" is "${text}", expected "${step.expected}"`,
      };
    }

    case "text-contains": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `text contains "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const text = await locator.innerText({ timeout });
      const passed = text.includes(step.expected ?? "");
      return {
        ...base,
        passed,
        expected: `text contains "${step.expected}"`,
        actual: `"${text}"`,
        message: passed
          ? `PASS: Text of "${step.selector}" contains "${step.expected}"`
          : `FAIL: Text of "${step.selector}" is "${text}", does not contain "${step.expected}"`,
      };
    }

    case "has-attribute": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `has attribute "${step.attribute}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const value = await locator.getAttribute(step.attribute!, { timeout });
      const passed = value !== null;
      return {
        ...base,
        passed,
        expected: `has attribute "${step.attribute}"`,
        actual: passed ? `attribute "${step.attribute}" present (value: "${value}")` : `attribute "${step.attribute}" not found`,
        message: passed
          ? `PASS: Element "${step.selector}" has attribute "${step.attribute}"`
          : `FAIL: Element "${step.selector}" does not have attribute "${step.attribute}"`,
      };
    }

    case "attribute-equals": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `attribute "${step.attribute}" equals "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const value = await locator.getAttribute(step.attribute!, { timeout });
      const passed = value === step.expected;
      return {
        ...base,
        passed,
        expected: `attribute "${step.attribute}" equals "${step.expected}"`,
        actual: value !== null ? `"${value}"` : "attribute not found",
        message: passed
          ? `PASS: Attribute "${step.attribute}" of "${step.selector}" equals "${step.expected}"`
          : `FAIL: Attribute "${step.attribute}" of "${step.selector}" is ${value !== null ? `"${value}"` : "not found"}, expected "${step.expected}"`,
      };
    }

    case "enabled": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is enabled",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const enabled = await locator.isEnabled({ timeout });
      return {
        ...base,
        passed: enabled,
        expected: "element is enabled",
        actual: enabled ? "enabled" : "disabled",
        message: enabled
          ? `PASS: Element "${step.selector}" is enabled`
          : `FAIL: Element "${step.selector}" is disabled`,
      };
    }

    case "disabled": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is disabled",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const enabled = await locator.isEnabled({ timeout });
      const passed = !enabled;
      return {
        ...base,
        passed,
        expected: "element is disabled",
        actual: enabled ? "enabled" : "disabled",
        message: passed
          ? `PASS: Element "${step.selector}" is disabled`
          : `FAIL: Element "${step.selector}" is enabled`,
      };
    }

    case "checked": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is checked",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const checked = await locator.isChecked({ timeout });
      return {
        ...base,
        passed: checked,
        expected: "element is checked",
        actual: checked ? "checked" : "not checked",
        message: checked
          ? `PASS: Element "${step.selector}" is checked`
          : `FAIL: Element "${step.selector}" is not checked`,
      };
    }

    case "not-checked": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is not checked",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const checked = await locator.isChecked({ timeout });
      const passed = !checked;
      return {
        ...base,
        passed,
        expected: "element is not checked",
        actual: checked ? "checked" : "not checked",
        message: passed
          ? `PASS: Element "${step.selector}" is not checked`
          : `FAIL: Element "${step.selector}" is checked`,
      };
    }

    case "value-equals": {
      try {
        await locator.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `value equals "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const value = await locator.inputValue({ timeout });
      const passed = value === step.expected;
      return {
        ...base,
        passed,
        expected: `value equals "${step.expected}"`,
        actual: `"${value}"`,
        message: passed
          ? `PASS: Value of "${step.selector}" equals "${step.expected}"`
          : `FAIL: Value of "${step.selector}" is "${value}", expected "${step.expected}"`,
      };
    }

    default: {
      return {
        ...base,
        passed: false,
        expected: null,
        actual: null,
        message: `Unknown assertion type: ${step.assertType}`,
      };
    }
  }
}
