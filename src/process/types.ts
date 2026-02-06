/**
 * Process management type definitions
 * Contract for all process resources tracked by the feedback server
 */

/**
 * Types of processes the server can manage
 */
export type ProcessType = "web-server" | "electron" | "windows-exe";

/**
 * Lifecycle status of a managed process
 */
export type ProcessStatus =
  | "launching"
  | "ready"
  | "running"
  | "stopped"
  | "error";

/**
 * Runtime information for a tracked process
 */
export interface ProcessInfo {
  /** Unique identifier (session ID + process type or similar) */
  id: string;
  /** The session this process belongs to */
  sessionId: string;
  /** Process type */
  type: ProcessType;
  /** Current lifecycle status */
  status: ProcessStatus;
  /** OS process ID (undefined if not yet spawned) */
  pid: number | undefined;
  /** The command that was used to launch */
  command: string;
  /** Arguments passed to the command */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Port number (for web servers) */
  port?: number;
  /** When the process was started */
  startedAt: Date;
  /** When readiness was detected */
  readyAt?: Date;
  /** Exit code if process has stopped */
  exitCode?: number | null;
}

/**
 * Configuration for launching a web server process
 */
export interface LaunchWebServerConfig {
  /** Session this process belongs to */
  sessionId: string;
  /** Command to execute (e.g., "npm", "npx") */
  command: string;
  /** Arguments (e.g., ["run", "dev"], ["vite"]) */
  args: string[];
  /** Working directory for the project */
  cwd: string;
  /** Expected port the server will listen on */
  port: number;
  /** Readiness timeout in ms (default 60000) */
  timeoutMs?: number;
}

/**
 * Configuration for launching an Electron application
 */
export interface LaunchElectronConfig {
  /** Session this process belongs to */
  sessionId: string;
  /** Path to Electron main entry file */
  entryPath: string;
  /** Optional working directory */
  cwd?: string;
  /** Launch timeout in ms (default 30000) */
  timeoutMs?: number;
}

/**
 * Configuration for launching a Windows executable
 */
export interface LaunchWindowsExeConfig {
  /** Session this process belongs to */
  sessionId: string;
  /** Path to the .exe file */
  exePath: string;
  /** Optional command line arguments */
  args?: string[];
  /** Optional working directory */
  cwd?: string;
}
