/**
 * Session lifecycle management
 * Tracks multiple concurrent sessions with unique UUIDs
 */

import { Session, Resource } from "./types/index.js";
import { PageReference, AutoCaptureData } from "./screenshot/types.js";
import {
  Collector,
  ConsoleEntry,
  ErrorEntry,
  NetworkEntry,
  ProcessOutputEntry,
} from "./capture/types.js";
import { randomUUID } from "crypto";

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private pageRefs: Map<string, PageReference> = new Map();
  private autoCaptures: Map<string, AutoCaptureData> = new Map();
  private consoleCollectors: Map<string, Collector<ConsoleEntry>> = new Map();
  private errorCollectors: Map<string, Collector<ErrorEntry>> = new Map();
  private networkCollectors: Map<string, Collector<NetworkEntry>> = new Map();
  private processCollectors: Map<string, Collector<ProcessOutputEntry>> = new Map();

  /**
   * Create a new session with a unique UUID
   * @returns Session ID
   */
  create(): string {
    const id = randomUUID();
    const session: Session = {
      id,
      createdAt: new Date(),
      resources: [],
    };
    this.sessions.set(id, session);
    console.error(`Session created: ${id}`);
    return id;
  }

  /**
   * Get a session by ID
   * @returns Session or undefined if not found
   */
  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * List all active session IDs
   * @returns Array of session IDs
   */
  list(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Add a resource to a session
   * @throws Error if session not found
   */
  addResource(sessionId: string, resource: Resource): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.resources.push(resource);
  }

  /**
   * Store a typed Playwright Page reference for a session
   * Key format: ${sessionId}:${identifier} where identifier is URL or 'electron'
   */
  setPageRef(sessionId: string, identifier: string, ref: PageReference): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    this.pageRefs.set(`${sessionId}:${identifier}`, ref);
  }

  /**
   * Get a specific page reference by session and identifier
   */
  getPageRef(sessionId: string, identifier: string): PageReference | undefined {
    return this.pageRefs.get(`${sessionId}:${identifier}`);
  }

  /**
   * Get all page references for a session
   */
  getPageRefs(sessionId: string): PageReference[] {
    const refs: PageReference[] = [];
    const prefix = `${sessionId}:`;
    for (const [key, ref] of this.pageRefs) {
      if (key.startsWith(prefix)) {
        refs.push(ref);
      }
    }
    return refs;
  }

  /**
   * Remove a specific page reference
   */
  removePageRef(sessionId: string, identifier: string): void {
    this.pageRefs.delete(`${sessionId}:${identifier}`);
  }

  /**
   * Re-key all Maps associated with a page identifier.
   * Used by navigate when goto changes the page URL.
   * Updates: pageRefs, consoleCollectors, errorCollectors, networkCollectors, processCollectors.
   * No-op for entries that don't exist under the old key.
   */
  rekeyIdentifier(sessionId: string, oldIdentifier: string, newIdentifier: string): void {
    const oldKey = `${sessionId}:${oldIdentifier}`;
    const newKey = `${sessionId}:${newIdentifier}`;

    // Re-key page ref
    const pageRef = this.pageRefs.get(oldKey);
    if (pageRef) {
      this.pageRefs.delete(oldKey);
      this.pageRefs.set(newKey, pageRef);
    }

    // Re-key all collector maps (silently skip if old key not present)
    const maps: Map<string, unknown>[] = [
      this.consoleCollectors,
      this.errorCollectors,
      this.networkCollectors,
      this.processCollectors,
    ];
    for (const map of maps) {
      const value = map.get(oldKey);
      if (value) {
        map.delete(oldKey);
        map.set(newKey, value);
      }
    }
  }

  /**
   * Store the latest auto-captured screenshot for a session
   */
  setAutoCapture(sessionId: string, data: AutoCaptureData): void {
    this.autoCaptures.set(sessionId, data);
  }

  /**
   * Get the latest auto-captured screenshot for a session
   */
  getAutoCapture(sessionId: string): AutoCaptureData | undefined {
    return this.autoCaptures.get(sessionId);
  }

  // --- Console Collectors ---

  /**
   * Store a console collector for a session
   */
  setConsoleCollector(sessionId: string, identifier: string, collector: Collector<ConsoleEntry>): void {
    this.consoleCollectors.set(`${sessionId}:${identifier}`, collector);
  }

  /**
   * Get a specific console collector by session and identifier
   */
  getConsoleCollector(sessionId: string, identifier: string): Collector<ConsoleEntry> | undefined {
    return this.consoleCollectors.get(`${sessionId}:${identifier}`);
  }

  /**
   * Get all console collectors for a session
   */
  getConsoleCollectors(sessionId: string): Collector<ConsoleEntry>[] {
    const collectors: Collector<ConsoleEntry>[] = [];
    const prefix = `${sessionId}:`;
    for (const [key, collector] of this.consoleCollectors) {
      if (key.startsWith(prefix)) {
        collectors.push(collector);
      }
    }
    return collectors;
  }

  // --- Error Collectors ---

  /**
   * Store an error collector for a session
   */
  setErrorCollector(sessionId: string, identifier: string, collector: Collector<ErrorEntry>): void {
    this.errorCollectors.set(`${sessionId}:${identifier}`, collector);
  }

  /**
   * Get a specific error collector by session and identifier
   */
  getErrorCollector(sessionId: string, identifier: string): Collector<ErrorEntry> | undefined {
    return this.errorCollectors.get(`${sessionId}:${identifier}`);
  }

  /**
   * Get all error collectors for a session
   */
  getErrorCollectors(sessionId: string): Collector<ErrorEntry>[] {
    const collectors: Collector<ErrorEntry>[] = [];
    const prefix = `${sessionId}:`;
    for (const [key, collector] of this.errorCollectors) {
      if (key.startsWith(prefix)) {
        collectors.push(collector);
      }
    }
    return collectors;
  }

  // --- Network Collectors ---

  /**
   * Store a network collector for a session
   */
  setNetworkCollector(sessionId: string, identifier: string, collector: Collector<NetworkEntry>): void {
    this.networkCollectors.set(`${sessionId}:${identifier}`, collector);
  }

  /**
   * Get a specific network collector by session and identifier
   */
  getNetworkCollector(sessionId: string, identifier: string): Collector<NetworkEntry> | undefined {
    return this.networkCollectors.get(`${sessionId}:${identifier}`);
  }

  /**
   * Get all network collectors for a session
   */
  getNetworkCollectors(sessionId: string): Collector<NetworkEntry>[] {
    const collectors: Collector<NetworkEntry>[] = [];
    const prefix = `${sessionId}:`;
    for (const [key, collector] of this.networkCollectors) {
      if (key.startsWith(prefix)) {
        collectors.push(collector);
      }
    }
    return collectors;
  }

  // --- Process Collectors ---

  /**
   * Store a process output collector for a session
   */
  setProcessCollector(sessionId: string, identifier: string, collector: Collector<ProcessOutputEntry>): void {
    this.processCollectors.set(`${sessionId}:${identifier}`, collector);
  }

  /**
   * Get a specific process collector by session and identifier
   */
  getProcessCollector(sessionId: string, identifier: string): Collector<ProcessOutputEntry> | undefined {
    return this.processCollectors.get(`${sessionId}:${identifier}`);
  }

  /**
   * Get all process collectors for a session
   */
  getProcessCollectors(sessionId: string): Collector<ProcessOutputEntry>[] {
    const collectors: Collector<ProcessOutputEntry>[] = [];
    const prefix = `${sessionId}:`;
    for (const [key, collector] of this.processCollectors) {
      if (key.startsWith(prefix)) {
        collectors.push(collector);
      }
    }
    return collectors;
  }

  /**
   * Destroy a session and clean up all its resources
   * Logs cleanup errors but doesn't throw
   * No-op if session doesn't exist
   */
  async destroy(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return; // No-op if session doesn't exist
    }

    console.error(`Destroying session ${sessionId} (${session.resources.length} resources)`);

    // Clean up page references for this session
    const prefix = `${sessionId}:`;
    for (const [key, ref] of this.pageRefs) {
      if (key.startsWith(prefix)) {
        try {
          if (ref.browserContext) {
            await ref.browserContext.close();
          }
          if (ref.browser) {
            await ref.browser.close();
          }
        } catch (error) {
          console.error(`Error cleaning up page ref in session ${sessionId}:`, error);
        }
        this.pageRefs.delete(key);
      }
    }

    // Clean up diagnostic collectors for this session
    for (const [key, collector] of this.consoleCollectors) {
      if (key.startsWith(prefix)) {
        collector.detach();
        this.consoleCollectors.delete(key);
      }
    }
    for (const [key, collector] of this.errorCollectors) {
      if (key.startsWith(prefix)) {
        collector.detach();
        this.errorCollectors.delete(key);
      }
    }
    for (const [key, collector] of this.networkCollectors) {
      if (key.startsWith(prefix)) {
        collector.detach();
        this.networkCollectors.delete(key);
      }
    }
    for (const [key, collector] of this.processCollectors) {
      if (key.startsWith(prefix)) {
        collector.detach();
        this.processCollectors.delete(key);
      }
    }

    // Clean up auto-capture data
    this.autoCaptures.delete(sessionId);

    // Clean up each resource individually
    for (const resource of session.resources) {
      try {
        await resource.cleanup();
      } catch (error) {
        console.error(`Error cleaning up resource in session ${sessionId}:`, error);
      }
    }

    this.sessions.delete(sessionId);
    console.error(`Session destroyed: ${sessionId}`);
  }

  /**
   * Destroy all sessions (for shutdown cleanup)
   */
  async destroyAll(): Promise<void> {
    const sessionIds = this.list();
    console.error(`Destroying all sessions (${sessionIds.length} total)`);

    for (const id of sessionIds) {
      await this.destroy(id);
    }
  }
}
