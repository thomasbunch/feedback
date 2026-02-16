/**
 * Page discovery result type
 * Used by interaction tools to resolve the active page for a session
 */

import type { Page } from "playwright";

/** Result of finding the active page for interaction */
export type PageDiscoveryResult =
  | {
      success: true;
      page: Page;
      identifier: string;
      type: "web" | "electron" | "tauri";
    }
  | {
      success: false;
      error: string;
      availablePages?: string[];
    };
