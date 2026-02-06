/**
 * Shared type definitions for the Feedback MCP server
 */

/**
 * Resource with cleanup capability
 */
export interface Resource {
  cleanup: () => Promise<void>;
}

/**
 * Session tracking active resources
 */
export interface Session {
  id: string;
  createdAt: Date;
  resources: Resource[];
}

/**
 * MCP tool result format (supports text and image content)
 */
export type ToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
};
