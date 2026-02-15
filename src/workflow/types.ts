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
 * - assert: selector (unless page-level assertion), assertType (plus expected/attribute depending on assertType)
 * - select: selector, exactly one of value/label/index
 * - press: key (selector optional — targets page keyboard if omitted)
 * - hover: selector
 * - scroll: at least one of selector, direction, scrollTo
 * - evaluate: expression
 * - upload: selector, files (non-empty array)
 * - drag: sourceSelector, targetSelector
 */
export interface WorkflowStep {
  /** Action to perform */
  action:
    | "click"
    | "type"
    | "navigate"
    | "screenshot"
    | "wait"
    | "assert"
    | "select"
    | "press"
    | "hover"
    | "scroll"
    | "evaluate"
    | "upload"
    | "drag";

  /** Element selector — required for click, type, wait, select, hover, upload */
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
    | "value-equals"
    | "css-equals"
    | "url-equals"
    | "url-contains"
    | "title-equals"
    | "count-equals"
    | "a11y-passes";

  /** Expected value for text/attribute assertions */
  expected?: string;

  /** Attribute name for attribute assertions */
  attribute?: string;

  /** Per-step timeout in ms (default: 30000) */
  timeout?: number;

  /** Select option by value attribute */
  value?: string;

  /** Select option by visible label text */
  label?: string;

  /** Select option by zero-based index */
  index?: number;

  /** Key name or combination for press action (e.g. "Enter", "Control+A") */
  key?: string;

  /** Position within element for hover action */
  position?: { x: number; y: number };

  /** Force action past actionability checks (hover, drag) */
  force?: boolean;

  /** Scroll direction */
  direction?: "up" | "down" | "left" | "right";

  /** Pixels to scroll (default: 500) */
  amount?: number;

  /** Scroll to absolute position */
  scrollTo?: "top" | "bottom";

  /** JavaScript expression for evaluate action */
  expression?: string;

  /** File paths for upload action */
  files?: string[];

  /** Source element selector for drag action */
  sourceSelector?: string;

  /** Target element selector for drag action */
  targetSelector?: string;

  /** Position within source element for drag */
  sourcePosition?: { x: number; y: number };

  /** Position within target element for drag */
  targetPosition?: { x: number; y: number };

  /** CSS property name for css-equals assertion */
  property?: string;
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
