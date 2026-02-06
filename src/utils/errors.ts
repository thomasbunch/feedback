/**
 * Structured error formatting for tool results
 */

import { ToolResult } from "../types/index.js";

/**
 * Create a tool error response with structured information
 * @param message Error message
 * @param context Optional context about what was being attempted
 * @param suggestedFix Optional suggestion for how to fix the issue
 * @returns ToolResult with isError: true
 */
export function createToolError(
  message: string,
  context?: string,
  suggestedFix?: string
): ToolResult {
  let text = `Error: ${message}`;

  if (context) {
    text += `\nContext: ${context}`;
  }

  if (suggestedFix) {
    text += `\nSuggested fix: ${suggestedFix}`;
  }

  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

/**
 * Create a successful tool result
 * @param data Data to serialize as JSON
 * @returns ToolResult with isError: false
 */
export function createToolResult(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
    isError: false,
  };
}

/**
 * Create a screenshot tool result with text metadata and image content
 * @param metadata Metadata to include as JSON text
 * @param imageBase64 Base64-encoded image data
 * @param mimeType Image MIME type (default: 'image/webp')
 * @returns ToolResult with text + image content
 */
export function createScreenshotResult(
  metadata: Record<string, unknown>,
  imageBase64: string,
  mimeType: string = "image/webp"
): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(metadata, null, 2),
      },
      {
        type: "image",
        data: imageBase64,
        mimeType,
      },
    ],
    isError: false,
  };
}
