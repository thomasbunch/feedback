/**
 * Unit tests for session-state resource page ref identifier mapping
 * Verifies Tauri and Electron pages display correctly (not "unknown")
 */
import { describe, it, expect } from "vitest";

// Test the mapping expression directly (extracted from resources/index.ts)
function mapPageRefIdentifier(ref: { type: string; url?: string }): string {
  return (ref.type === "electron" || ref.type === "tauri") ? ref.type : ref.url ?? "unknown";
}

describe("session-state page ref identifier mapping", () => {
  it("maps Tauri page ref to 'tauri'", () => {
    expect(mapPageRefIdentifier({ type: "tauri" })).toBe("tauri");
  });

  it("maps Electron page ref to 'electron'", () => {
    expect(mapPageRefIdentifier({ type: "electron" })).toBe("electron");
  });

  it("maps web page ref to its URL", () => {
    expect(mapPageRefIdentifier({ type: "web", url: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it("maps web page ref without URL to 'unknown'", () => {
    expect(mapPageRefIdentifier({ type: "web" })).toBe("unknown");
  });

  it("maps Tauri page ref even when url is present", () => {
    expect(mapPageRefIdentifier({ type: "tauri", url: "http://localhost:1234" })).toBe("tauri");
  });

  it("maps Electron page ref even when url is present", () => {
    expect(mapPageRefIdentifier({ type: "electron", url: "http://localhost:5678" })).toBe("electron");
  });
});
