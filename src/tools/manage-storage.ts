/**
 * manage_storage MCP tool
 * Reads, writes, deletes, and manages browser storage: cookies, localStorage, and sessionStorage
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../session-manager.js";
import { createToolError, createToolResult } from "../utils/errors.js";
import { getActivePage } from "../interaction/selectors.js";

/**
 * Register the manage_storage tool with the MCP server
 *
 * @param server - MCP server instance
 * @param sessionManager - Session manager for resource tracking
 */
export function registerManageStorageTool(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.tool(
    "manage_storage",
    "Read, write, delete, and manage browser storage: cookies, localStorage, and sessionStorage. Also supports saving and restoring full browser storage state. Use for testing auth flows, user preferences, and data persistence.",
    {
      sessionId: z
        .string()
        .describe("Session ID from create_session"),
      action: z
        .enum(["get", "set", "delete", "clear", "get_all", "save", "restore"])
        .describe("Storage operation to perform"),
      storageType: z
        .enum(["cookies", "localStorage", "sessionStorage"])
        .describe("Which storage to operate on"),
      key: z
        .string()
        .optional()
        .describe(
          "Cookie name or storage key. Required for get, set, delete."
        ),
      value: z
        .string()
        .optional()
        .describe("Value to set. Required for action: 'set'."),
      cookieOptions: z
        .object({
          domain: z.string().optional(),
          path: z.string().optional(),
          secure: z.boolean().optional(),
          httpOnly: z.boolean().optional(),
          sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
          expires: z
            .number()
            .optional()
            .describe("Unix timestamp for cookie expiry"),
        })
        .optional()
        .describe(
          "Additional cookie attributes when setting cookies. Ignored for localStorage/sessionStorage."
        ),
      state: z
        .string()
        .optional()
        .describe(
          "JSON string of storage state to restore. Used with action: 'restore'. For cookies, this is the array from a prior 'save'. For localStorage/sessionStorage, this is the key-value object from a prior 'save'."
        ),
      pageIdentifier: z
        .string()
        .optional()
        .describe(
          "URL or 'electron' to target a specific page. Omit if session has only one page."
        ),
    },
    async ({
      sessionId,
      action,
      storageType,
      key,
      value,
      cookieOptions,
      state,
      pageIdentifier,
    }) => {
      try {
        // Validate action-specific required parameters
        if ((action === "get" || action === "delete") && !key) {
          return createToolError(
            `Key required for ${action} action`,
            `action is '${action}' but no key was provided`,
            "Provide the cookie name or storage key to operate on."
          );
        }

        if (action === "set" && (!key || value === undefined)) {
          return createToolError(
            "Key and value required for set action",
            `action is 'set' but ${!key ? "no key" : "no value"} was provided`,
            "Provide both key and value for the storage entry to set."
          );
        }

        if (action === "restore" && !state) {
          return createToolError(
            "State required for restore action",
            "action is 'restore' but no state was provided",
            "Use the state string returned by a prior 'save' action."
          );
        }

        // Validate session exists
        const session = sessionManager.get(sessionId);
        if (!session) {
          const availableSessions = sessionManager.list();
          return createToolError(
            `Session not found: ${sessionId}`,
            "The session may have already been ended",
            availableSessions.length > 0
              ? `Available sessions: ${availableSessions.join(", ")}`
              : "Create a session first with create_session."
          );
        }

        // Find the active page
        const pageResult = getActivePage(
          sessionManager,
          sessionId,
          pageIdentifier
        );
        if (!pageResult.success) {
          return createToolError(
            pageResult.error,
            `Session: ${sessionId}`,
            pageResult.availablePages
              ? `Available pages: ${pageResult.availablePages.join(", ")}`
              : undefined
          );
        }

        const { page } = pageResult;

        // Route to storage-type-specific handler
        if (storageType === "cookies") {
          return await handleCookies(page, action, key, value, cookieOptions, state);
        } else if (storageType === "localStorage") {
          return await handleWebStorage(page, "localStorage", action, key, value, state);
        } else {
          return await handleWebStorage(page, "sessionStorage", action, key, value, state);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        // Page not loaded errors
        if (
          message.includes("not been loaded") ||
          message.includes("about:blank") ||
          message.includes("no execution context")
        ) {
          return createToolError(
            "Page must be navigated to a URL before accessing storage",
            "Storage operations require an active page with a URL (not about:blank)",
            "Take a screenshot first to navigate to the app URL, or use navigate to load a page."
          );
        }

        // Invalid JSON for restore
        if (message.includes("JSON")) {
          return createToolError(
            "Invalid state format",
            "The state string is not valid JSON",
            "Use the state string returned by a prior 'save' action."
          );
        }

        // Default error
        return createToolError(
          "Failed to manage storage",
          message,
          "Take a screenshot to verify the page state."
        );
      }
    }
  );
}

/**
 * Handle cookie operations via BrowserContext API
 */
async function handleCookies(
  page: import("playwright").Page,
  action: string,
  key: string | undefined,
  value: string | undefined,
  cookieOptions:
    | {
        domain?: string;
        path?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: "Strict" | "Lax" | "None";
        expires?: number;
      }
    | undefined,
  state: string | undefined
) {
  const context = page.context();

  switch (action) {
    case "get": {
      const cookies = await context.cookies();
      const cookie = cookies.find((c) => c.name === key);
      return createToolResult({
        key,
        cookie: cookie ?? null,
        found: !!cookie,
      });
    }

    case "set": {
      const url = page.url();
      const domain = cookieOptions?.domain ?? new URL(url).hostname;
      await context.addCookies([
        {
          name: key!,
          value: value!,
          domain,
          path: cookieOptions?.path ?? "/",
          secure: cookieOptions?.secure ?? false,
          httpOnly: cookieOptions?.httpOnly ?? false,
          sameSite: cookieOptions?.sameSite ?? "Lax",
          expires: cookieOptions?.expires ?? -1,
        },
      ]);
      return createToolResult({ key, value, set: true });
    }

    case "delete": {
      const cookies = await context.cookies();
      const filtered = cookies.filter((c) => c.name !== key);
      await context.clearCookies();
      if (filtered.length > 0) {
        await context.addCookies(filtered);
      }
      return createToolResult({ key, deleted: true });
    }

    case "clear": {
      await context.clearCookies();
      return createToolResult({ storageType: "cookies", cleared: true });
    }

    case "get_all": {
      const cookies = await context.cookies();
      return createToolResult({
        storageType: "cookies",
        count: cookies.length,
        cookies,
      });
    }

    case "save": {
      const cookies = await context.cookies();
      return createToolResult({
        storageType: "cookies",
        count: cookies.length,
        state: JSON.stringify(cookies),
      });
    }

    case "restore": {
      const cookiesArray = JSON.parse(state!);
      await context.clearCookies();
      await context.addCookies(cookiesArray);
      return createToolResult({
        storageType: "cookies",
        restored: true,
        count: cookiesArray.length,
      });
    }

    default:
      return createToolError(
        `Unknown action: ${action}`,
        "This should not happen",
        "Use one of: get, set, delete, clear, get_all, save, restore"
      );
  }
}

/**
 * Handle localStorage and sessionStorage operations via page.evaluate
 */
async function handleWebStorage(
  page: import("playwright").Page,
  storageType: "localStorage" | "sessionStorage",
  action: string,
  key: string | undefined,
  value: string | undefined,
  state: string | undefined
) {
  switch (action) {
    case "get": {
      const val = await page.evaluate(
        ({ k, st }) => {
          const storage = st === "localStorage" ? localStorage : sessionStorage;
          return storage.getItem(k);
        },
        { k: key!, st: storageType }
      );
      return createToolResult({
        key,
        value: val,
        found: val !== null,
      });
    }

    case "set": {
      await page.evaluate(
        ({ k, v, st }) => {
          const storage = st === "localStorage" ? localStorage : sessionStorage;
          storage.setItem(k, v);
        },
        { k: key!, v: value!, st: storageType }
      );
      return createToolResult({ key, value, set: true });
    }

    case "delete": {
      await page.evaluate(
        ({ k, st }) => {
          const storage = st === "localStorage" ? localStorage : sessionStorage;
          storage.removeItem(k);
        },
        { k: key!, st: storageType }
      );
      return createToolResult({ key, deleted: true });
    }

    case "clear": {
      await page.evaluate(
        ({ st }) => {
          const storage = st === "localStorage" ? localStorage : sessionStorage;
          storage.clear();
        },
        { st: storageType }
      );
      return createToolResult({ storageType, cleared: true });
    }

    case "get_all": {
      const items = await page.evaluate(
        ({ st }) => {
          const storage = st === "localStorage" ? localStorage : sessionStorage;
          const result: Record<string, string> = {};
          for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i)!;
            result[k] = storage.getItem(k)!;
          }
          return result;
        },
        { st: storageType }
      );
      return createToolResult({
        storageType,
        count: Object.keys(items).length,
        items,
      });
    }

    case "save": {
      const items = await page.evaluate(
        ({ st }) => {
          const storage = st === "localStorage" ? localStorage : sessionStorage;
          const result: Record<string, string> = {};
          for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i)!;
            result[k] = storage.getItem(k)!;
          }
          return result;
        },
        { st: storageType }
      );
      return createToolResult({
        storageType,
        count: Object.keys(items).length,
        state: JSON.stringify(items),
      });
    }

    case "restore": {
      const items = JSON.parse(state!);
      await page.evaluate(
        ({ obj, st }) => {
          const storage = st === "localStorage" ? localStorage : sessionStorage;
          storage.clear();
          Object.entries(obj).forEach(([k, v]) =>
            storage.setItem(k, v as string)
          );
        },
        { obj: items, st: storageType }
      );
      return createToolResult({
        storageType,
        restored: true,
        count: Object.keys(items).length,
      });
    }

    default:
      return createToolError(
        `Unknown action: ${action}`,
        "This should not happen",
        "Use one of: get, set, delete, clear, get_all, save, restore"
      );
  }
}
