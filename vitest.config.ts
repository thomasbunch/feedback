import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".js", ".mjs", ".json"],
  },
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 30_000,
    pool: "forks",
    fileParallelism: false,
  },
});
