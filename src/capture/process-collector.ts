/**
 * ERRX-03: Process stdout/stderr buffered capture
 * Attaches to child process output streams, splits multi-line output,
 * and tags each line with stream source (stdout/stderr).
 */

import type { ChildProcess } from "child_process";
import { Collector, ProcessOutputEntry } from "./types.js";

/**
 * Attach a process output collector to a child process.
 * Captures stdout and stderr, splitting multi-line output into individual entries.
 *
 * @param child - Node.js ChildProcess to monitor
 * @param maxLines - Maximum entries to buffer (oldest dropped when full)
 * @returns Collector with getEntries() and detach()
 */
export function attachProcessCollector(child: ChildProcess, maxLines = 5000): Collector<ProcessOutputEntry> {
  const entries: ProcessOutputEntry[] = [];

  const createHandler = (stream: "stdout" | "stderr") => {
    return (data: Buffer): void => {
      const text = data.toString();
      const lines = text.split("\n");

      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed.length === 0) {
          continue;
        }

        const entry: ProcessOutputEntry = {
          timestamp: new Date().toISOString(),
          stream,
          text: trimmed,
        };

        if (entries.length >= maxLines) {
          entries.shift();
        }
        entries.push(entry);
      }
    };
  };

  const stdoutHandler = createHandler("stdout");
  const stderrHandler = createHandler("stderr");

  child.stdout?.on("data", stdoutHandler);
  child.stderr?.on("data", stderrHandler);

  return {
    getEntries: () => [...entries],
    detach: () => {
      child.stdout?.off("data", stdoutHandler);
      child.stderr?.off("data", stderrHandler);
    },
  };
}
