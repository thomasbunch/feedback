/**
 * Process tree cleanup utility
 * Wraps tree-kill with timeout for best-effort process termination
 */

import treeKill from "tree-kill";
import { ChildProcess } from "child_process";
import { Resource } from "../types/index.js";
import { ProcessType } from "./types.js";

/**
 * Kill a process and all its children (best-effort)
 * Always resolves -- cleanup should never block shutdown
 *
 * @param pid - OS process ID to kill
 * @param timeoutMs - Maximum time to wait for kill (default 5000ms)
 */
export function killProcessTree(
  pid: number,
  timeoutMs: number = 5000
): Promise<void> {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.error(
        `[Process] Tree-kill timeout after ${timeoutMs}ms for PID ${pid}, continuing anyway`
      );
      resolve();
    }, timeoutMs);

    treeKill(pid, "SIGTERM", (error?: Error) => {
      clearTimeout(timeout);
      if (error) {
        console.error(
          `[Process] Tree-kill error for PID ${pid}: ${error.message} (process may already be dead)`
        );
      } else {
        console.error(`[Process] Killed process tree for PID ${pid}`);
      }
      resolve();
    });
  });
}

/**
 * Create a Resource that cleans up a child process on disposal
 * Integrates with SessionManager's resource tracking
 *
 * @param childProcess - The spawned child process
 * @param _type - Process type (for future use in type-specific cleanup)
 */
export function createProcessResource(
  childProcess: ChildProcess,
  _type: ProcessType
): Resource {
  return {
    cleanup: async () => {
      // Process already exited -- nothing to clean up
      if (childProcess.exitCode !== null) {
        return;
      }
      if (childProcess.pid !== undefined) {
        await killProcessTree(childProcess.pid);
      }
    },
  };
}
