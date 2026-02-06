/**
 * Server readiness detection
 * Uses dual strategy: stdout pattern matching + TCP port polling
 */

import { ChildProcess } from "child_process";
import waitOn from "wait-on";

/**
 * Common server ready patterns across popular dev servers
 */
const readyPatterns: RegExp[] = [
  /Local:.*https?:\/\/localhost[:\d]*/i, // Vite
  /webpack.*compiled/i, // webpack
  /ready.*started.*server.*on/i, // Next.js
  /server.*(?:listening|running|started).*:\d+/i, // generic
  /ready on/i, // Next.js alt
  /compiled successfully/i, // CRA
];

/**
 * Detect when a spawned server is ready to accept connections
 * Races two strategies: stdout pattern matching and TCP port availability
 *
 * @param child - The spawned server process
 * @param port - Expected port the server will listen on
 * @param timeoutMs - Maximum time to wait for readiness (default 60000ms)
 */
export function detectServerReady(
  child: ChildProcess,
  port: number,
  timeoutMs: number = 60000
): Promise<void> {
  // Strategy 1: stdout/stderr pattern matching
  const stdoutReady = new Promise<void>((resolve, reject) => {
    const checkOutput = (data: Buffer): void => {
      const text = data.toString();
      for (const pattern of readyPatterns) {
        if (pattern.test(text)) {
          cleanup();
          resolve();
          return;
        }
      }
    };

    const onExit = (code: number | null): void => {
      cleanup();
      reject(
        new Error(
          `Server process exited before becoming ready (exit code: ${code})`
        )
      );
    };

    const cleanup = (): void => {
      child.stdout?.removeListener("data", checkOutput);
      child.stderr?.removeListener("data", checkOutput);
      child.removeListener("exit", onExit);
    };

    child.stdout?.on("data", checkOutput);
    child.stderr?.on("data", checkOutput);
    child.on("exit", onExit);
  });

  // Strategy 2: TCP port polling via wait-on
  const portReady = waitOn({
    resources: [`tcp:localhost:${port}`],
    timeout: timeoutMs,
    interval: 500,
    log: false,
  });

  return Promise.race([stdoutReady, portReady]).then(
    () => {
      console.error(`[Monitor] Server ready on port ${port}`);
    },
    (error: unknown) => {
      // Provide better error context if the process has already exited
      if (child.exitCode !== null) {
        throw new Error(
          `Server process exited with code ${child.exitCode} before becoming ready on port ${port}`
        );
      }
      throw error;
    }
  );
}
