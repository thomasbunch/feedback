/**
 * Cross-platform process spawning utility
 * Handles Windows quirks (cmd scripts, npm wrappers) transparently
 */

import { spawn, ChildProcess, SpawnOptions } from "child_process";

/**
 * Spawn a process with cross-platform compatibility
 * Automatically enables shell mode on Windows for npm/npx and .cmd/.bat files
 *
 * @param command - Command to execute
 * @param args - Arguments for the command
 * @param options - Additional spawn options
 */
export function spawnCrossPlatform(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): ChildProcess {
  const isWindows = process.platform === "win32";

  let useShell = options.shell ?? false;

  if (isWindows) {
    const lowerCmd = command.toLowerCase();
    // npm/npx on Windows are .cmd files that require shell
    if (
      lowerCmd === "npm" ||
      lowerCmd === "npx" ||
      lowerCmd.endsWith(".cmd") ||
      lowerCmd.endsWith(".bat")
    ) {
      useShell = true;
    }
  }

  return spawn(command, args, {
    ...options,
    shell: useShell,
    windowsHide: true,
    stdio: options.stdio || "pipe",
  });
}

/**
 * Attach logging listeners to a child process
 * All output is routed to console.error to avoid corrupting stdio transport
 *
 * @param child - The child process to monitor
 * @param label - Label for log messages (e.g., "web-server")
 */
export function attachProcessListeners(
  child: ChildProcess,
  label: string
): void {
  child.stdout?.on("data", (data: Buffer) => {
    console.error(`[${label} stdout] ${data.toString().trim()}`);
  });

  child.stderr?.on("data", (data: Buffer) => {
    console.error(`[${label} stderr] ${data.toString().trim()}`);
  });

  child.on("error", (err: Error) => {
    console.error(`[${label}] Spawn error: ${err.message}`);
  });

  child.on("exit", (code: number | null, signal: string | null) => {
    console.error(`[${label}] Exited: code=${code}, signal=${signal}`);
  });
}
