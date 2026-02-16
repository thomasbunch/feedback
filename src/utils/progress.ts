/**
 * Progress notification utility for long-running MCP tool operations.
 * Wraps the MCP notifications/progress pattern with best-effort delivery.
 */

import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";

/** Convenience alias for the extra parameter passed to tool callbacks. */
export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Send a progress notification to the client.
 *
 * - If the client did not provide a progressToken, this is a no-op.
 * - Progress delivery is best-effort: errors are logged but never thrown.
 *
 * @param extra - The extra parameter from the tool callback
 * @param progress - Current progress value (0-based)
 * @param total - Total expected progress value
 * @param message - Human-readable progress description
 */
export async function sendProgress(
  extra: ToolExtra,
  progress: number,
  total: number,
  message: string
): Promise<void> {
  const progressToken = extra._meta?.progressToken;
  if (progressToken === undefined) return;

  try {
    await extra.sendNotification({
      method: "notifications/progress",
      params: { progressToken, progress, total, message },
    });
  } catch (error) {
    console.error(`Progress notification failed: ${error}`);
  }
}
