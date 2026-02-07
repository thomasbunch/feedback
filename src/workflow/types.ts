/**
 * Workflow execution types
 * Defines step schemas, per-step results, and overall workflow results
 * for the sequential action executor (QA-01/QA-02).
 */

import type { ConsoleEntry, ErrorEntry } from "../capture/types.js";

/**
 * A single workflow step — flat schema with action-specific optional fields.
 *
 * Required fields per action:
 * - click: selector
 * - type: selector, text (text can be empty string but must be defined)
 * - navigate: url
 * - wait: selector
 * - screenshot: (no required fields)
 * - assert: selector, assertType (plus expected/attribute depending on assertType)
 */
export interface WorkflowStep {
  /** Action to perform */
  action: "click" | "type" | "navigate" | "screenshot" | "wait" | "assert";

  /** Element selector — required for click, type, wait */
  selector?: string;

  /** Text to type — required for type action */
  text?: string;

  /** URL to navigate to — required for navigate action */
  url?: string;

  /** Mouse button for click (default: left) */
  button?: "left" | "right" | "middle";

  /** Number of clicks for click action (1-3, e.g. 2 for double-click) */
  clickCount?: number;

  /** Type one character at a time instead of fill/paste (default: false) */
  pressSequentially?: boolean;

  /** Clear field before typing (default: true). Set false to append. */
  clear?: boolean;

  /** Capture full scrollable page for screenshot step */
  fullPage?: boolean;

  /** Wait state for wait action (default: visible) */
  state?: "visible" | "hidden" | "attached" | "detached";

  /** Assertion type — required for assert action */
  assertType?:
    | "exists"
    | "not-exists"
    | "visible"
    | "hidden"
    | "text-equals"
    | "text-contains"
    | "has-attribute"
    | "attribute-equals"
    | "enabled"
    | "disabled"
    | "checked"
    | "not-checked"
    | "value-equals";

  /** Expected value for text/attribute assertions */
  expected?: string;

  /** Attribute name for attribute assertions */
  attribute?: string;

  /** Per-step timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Result of a single workflow step execution.
 * Always includes log deltas for debugging context.
 * Screenshot is captured even on failure (best-effort).
 */
export interface StepResult {
  /** Zero-based index of this step in the workflow */
  stepIndex: number;

  /** Action that was executed */
  action: string;

  /** Whether the step completed successfully */
  success: boolean;

  /** ISO timestamp when step execution started */
  timestamp: string;

  /** Base64-encoded screenshot captured after step (WebP, quality 60, max 1024px wide) */
  screenshotBase64?: string;

  /** MIME type of the screenshot (image/webp) */
  screenshotMimeType?: string;

  /** Console log entries captured during this step */
  consoleDelta: ConsoleEntry[];

  /** Error entries captured during this step */
  errorDelta: ErrorEntry[];

  /** Error message if step failed */
  error?: string;

  /** Structured assertion result — only present for assert steps */
  assertion?: {
    passed: boolean;
    assertType: string;
    selector: string;
    expected: string | null;
    actual: string | null;
    message: string;
  };
}

/**
 * Overall workflow execution result.
 * Contains all step results and summary counts.
 */
export interface WorkflowResult {
  /** Results for each executed step (may be fewer than totalSteps on failure) */
  steps: StepResult[];

  /** Total number of steps in the input workflow */
  totalSteps: number;

  /** Number of steps that completed successfully */
  completedSteps: number;

  /** Index of the failed step, if any */
  failedStep?: number;
}
