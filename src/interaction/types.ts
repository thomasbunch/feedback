/**
 * Interaction-specific type definitions
 * Used by click_element, type_text, and navigation tools
 */

import type { Page } from "playwright";

/** Options for click_element tool */
export interface ClickOptions {
  button?: "left" | "right" | "middle";
  clickCount?: number; // 1 = single, 2 = double-click
  position?: { x: number; y: number }; // click position within element
  force?: boolean; // bypass actionability checks
  timeout?: number; // ms, default 30000
}

/** Options for type_text tool */
export interface TypeOptions {
  pressSequentially?: boolean; // true = per-keystroke, false = fill (default)
  delay?: number; // ms between keystrokes (only with pressSequentially)
  clear?: boolean; // clear field before typing (default true)
  timeout?: number; // ms, default 30000
}

/** Navigate tool actions */
export type NavigateAction = "goto" | "back" | "forward";

/** Result of finding the active page for interaction */
export type PageDiscoveryResult =
  | {
      success: true;
      page: Page;
      identifier: string;
      type: "web" | "electron";
    }
  | {
      success: false;
      error: string;
      availablePages?: string[];
    };
