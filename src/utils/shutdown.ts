/**
 * Graceful shutdown coordinator with cleanup handler registry
 */

export class ShutdownManager {
  private cleanupHandlers: Array<() => Promise<void>> = [];
  private isShuttingDown = false;

  /**
   * Register a cleanup handler to run during shutdown
   */
  register(handler: () => Promise<void>): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Execute all cleanup handlers and exit process
   * Safe to call multiple times - subsequent calls are ignored
   */
  async cleanup(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.error("Shutting down...");

    // Run all handlers in parallel with individual try/catch
    const results = await Promise.allSettled(
      this.cleanupHandlers.map((handler) => handler())
    );

    // Log any handler failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Cleanup handler ${index} failed:`, result.reason);
      }
    });

    console.error("Shutdown complete");
    process.exit(0);
  }
}
