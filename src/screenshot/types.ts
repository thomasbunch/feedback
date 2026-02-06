/**
 * Screenshot-specific type definitions
 */

import type { Page, Browser, BrowserContext, ElectronApplication } from "playwright";

/**
 * Options for taking a screenshot
 */
export interface ScreenshotOptions {
  fullPage?: boolean;    // default: false (viewport only)
  maxWidth?: number;     // default: 1280
  quality?: number;      // WebP quality 1-100, default: 80
}

/**
 * Result of a captured and optimized screenshot
 */
export interface ScreenshotResult {
  data: string;          // base64-encoded image
  mimeType: string;      // e.g., 'image/webp'
  width: number;
  height: number;
  originalSize: number;  // raw buffer bytes
  optimizedSize: number; // optimized buffer bytes
}

/**
 * Stored reference to a Playwright Page for screenshot access
 */
export interface PageReference {
  type: "web" | "electron";
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
