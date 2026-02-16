/**
 * Screenshot type definitions for page references and auto-capture data
 */

import type { Page, Browser, BrowserContext, ElectronApplication } from "playwright";

/**
 * Stored reference to a Playwright Page for screenshot access
 */
export interface PageReference {
  type: "web" | "electron" | "tauri";
  page: Page;
  browser?: Browser;              // only for web (lazy-created)
  browserContext?: BrowserContext; // only for web
  electronApp?: ElectronApplication; // only for electron
  url?: string;                   // for web: the URL being viewed
}

/**
 * Data stored from an auto-capture event
 */
export interface AutoCaptureData {
  imageBase64: string;
  mimeType: string;
  url: string;
  capturedAt: Date;
}
