/**
 * Session lifecycle management
 * Tracks multiple concurrent sessions with unique UUIDs
 */

import { Session, Resource } from "./types/index.js";
import { randomUUID } from "crypto";

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

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
