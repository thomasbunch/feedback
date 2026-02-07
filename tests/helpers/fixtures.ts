/**
 * Test fixture paths and port constants
 */

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root fixtures directory */
export const FIXTURES_DIR = path.resolve(__dirname, "..", "fixtures");

/** Web app fixture directory */
export const WEB_FIXTURE_DIR = path.resolve(FIXTURES_DIR, "web-app");

/** Electron app fixture directory */
export const ELECTRON_FIXTURE_DIR = path.resolve(FIXTURES_DIR, "electron-app");

/** Windows desktop app fixture directory */
export const WIN_FIXTURE_DIR = path.resolve(FIXTURES_DIR, "win-app");

/** Port for web fixture server */
export const WEB_PORT = 15100;

/** Port for Windows fixture app */
export const WIN_PORT = 15200;
