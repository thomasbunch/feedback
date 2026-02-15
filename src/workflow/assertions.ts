/**
 * Assertion evaluation for workflow assert steps.
 * Queries element state via Playwright locator methods and returns
 * structured pass/fail results.
 */

import type { Page } from "playwright";
import type { WorkflowStep } from "./types.js";
import { resolveSelector } from "../interaction/selectors.js";
import { AxeBuilder } from "@axe-core/playwright";

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
    selector: step.selector ?? "(page-level)",
  };

  const pageLevelTypes = ["url-equals", "url-contains", "title-equals", "a11y-passes"];
  const isPageLevel = pageLevelTypes.includes(step.assertType!);

  // Only resolve locator for element-level assertions
  const locator = isPageLevel ? null : resolveSelector(page, step.selector!);

  switch (step.assertType) {
    case "exists": {
      const count = await locator!.count();
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
      const count = await locator!.count();
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is visible",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM (timeout waiting for attachment)`,
        };
      }
      const visible = await locator!.isVisible();
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
      const count = await locator!.count();
      if (count === 0) {
        return {
          ...base,
          passed: true,
          expected: "element is hidden",
          actual: "not in DOM (hidden)",
          message: `PASS: Element "${step.selector}" is not in DOM (counts as hidden)`,
        };
      }
      const visible = await locator!.isVisible();
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `text equals "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const text = (await locator!.innerText({ timeout })).trim();
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `text contains "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const text = await locator!.innerText({ timeout });
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `has attribute "${step.attribute}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const value = await locator!.getAttribute(step.attribute!, { timeout });
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `attribute "${step.attribute}" equals "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const value = await locator!.getAttribute(step.attribute!, { timeout });
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is enabled",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const enabled = await locator!.isEnabled({ timeout });
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is disabled",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const enabled = await locator!.isEnabled({ timeout });
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is checked",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const checked = await locator!.isChecked({ timeout });
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: "element is not checked",
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const checked = await locator!.isChecked({ timeout });
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
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `value equals "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const value = await locator!.inputValue({ timeout });
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

    case "css-equals": {
      try {
        await locator!.waitFor({ state: "attached", timeout });
      } catch {
        return {
          ...base,
          passed: false,
          expected: `CSS ${step.property} equals "${step.expected}"`,
          actual: "element not found in DOM",
          message: `FAIL: Element "${step.selector}" not found in DOM`,
        };
      }
      const value = await locator!.evaluate(
        (el: Element, prop: string) => window.getComputedStyle(el).getPropertyValue(prop),
        step.property!
      );
      const passed = value.trim() === step.expected;
      return {
        ...base,
        passed,
        expected: `CSS ${step.property} equals "${step.expected}"`,
        actual: `"${value.trim()}"`,
        message: passed
          ? `PASS: CSS "${step.property}" of "${step.selector}" equals "${step.expected}"`
          : `FAIL: CSS "${step.property}" of "${step.selector}" is "${value.trim()}", expected "${step.expected}"`,
      };
    }

    case "url-equals": {
      const url = page.url();
      const passed = url === step.expected;
      return {
        ...base,
        passed,
        expected: `URL equals "${step.expected}"`,
        actual: `"${url}"`,
        message: passed
          ? `PASS: URL equals "${step.expected}"`
          : `FAIL: URL is "${url}", expected "${step.expected}"`,
      };
    }

    case "url-contains": {
      const url = page.url();
      const passed = url.includes(step.expected ?? "");
      return {
        ...base,
        passed,
        expected: `URL contains "${step.expected}"`,
        actual: `"${url}"`,
        message: passed
          ? `PASS: URL contains "${step.expected}"`
          : `FAIL: URL "${url}" does not contain "${step.expected}"`,
      };
    }

    case "title-equals": {
      const title = await page.title();
      const passed = title === step.expected;
      return {
        ...base,
        passed,
        expected: `title equals "${step.expected}"`,
        actual: `"${title}"`,
        message: passed
          ? `PASS: Title equals "${step.expected}"`
          : `FAIL: Title is "${title}", expected "${step.expected}"`,
      };
    }

    case "count-equals": {
      const count = await locator!.count();
      const expectedCount = parseInt(step.expected!, 10);
      const passed = count === expectedCount;
      return {
        ...base,
        passed,
        expected: `count equals ${expectedCount}`,
        actual: `${count}`,
        message: passed
          ? `PASS: "${step.selector}" matches ${count} element(s)`
          : `FAIL: "${step.selector}" matches ${count} element(s), expected ${expectedCount}`,
      };
    }

    case "a11y-passes": {
      const builder = new AxeBuilder({ page });
      if (step.selector) builder.include(step.selector);
      const results = await builder.analyze();
      const passed = results.violations.length === 0;
      return {
        ...base,
        passed,
        expected: "0 accessibility violations",
        actual: `${results.violations.length} violation(s)`,
        message: passed
          ? `PASS: No accessibility violations${step.selector ? ` in "${step.selector}"` : ""}`
          : `FAIL: ${results.violations.length} accessibility violation(s)${step.selector ? ` in "${step.selector}"` : ""}: ${results.violations.map(v => v.id).join(", ")}`,
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
