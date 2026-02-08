/**
 * Shared helper to parse the text content from an MCP tool result.
 *
 * Handles all MCP tool result shapes:
 * - Throws if result.isError is true (with descriptive message)
 * - Finds the first `type === "text"` entry in the content array
 * - Parses the text as JSON; returns raw string if not valid JSON
 */
export function parseToolResult(result: {
  isError?: boolean;
  content: unknown;
}): Record<string, unknown> {
  if (result.isError) {
    const content = result.content as Array<{ type: string; text: string }>;
    const errorText = content?.[0]?.text ?? "Unknown error";
    throw new Error(`Tool returned error: ${errorText}`);
  }
  const content = result.content as Array<{ type: string; text: string }>;
  const textEntry = content.find((c) => c.type === "text");
  if (!textEntry) throw new Error("No text content in tool result");
  try {
    return JSON.parse(textEntry.text);
  } catch {
    return { text: textEntry.text } as Record<string, unknown>;
  }
}
