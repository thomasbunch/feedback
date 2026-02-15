/**
 * MCP prompt integration tests
 * Tests: prompt listing, description presence, prompt retrieval with URL interpolation
 * Verifies: MCPP-02 (MCP Prompts for QA scenario templates)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createTestClient,
  TestContext,
} from "../../helpers/mcp-test-client.js";

describe("MCP Prompts", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestClient();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it(
    "lists 3 available prompts",
    async () => {
      const { prompts } = await ctx.client.listPrompts();

      expect(prompts.length).toBe(3);

      const names = prompts.map((p) => p.name);
      expect(names).toContain("smoke-test");
      expect(names).toContain("accessibility-check");
      expect(names).toContain("responsive-check");
    },
    30_000
  );

  it(
    "each prompt has a description",
    async () => {
      const { prompts } = await ctx.client.listPrompts();

      for (const prompt of prompts) {
        expect(prompt.description).toBeDefined();
        expect(typeof prompt.description).toBe("string");
        expect(prompt.description!.length).toBeGreaterThan(0);
      }
    },
    30_000
  );

  it(
    "gets smoke-test prompt with url argument",
    async () => {
      const result = await ctx.client.getPrompt({
        name: "smoke-test",
        arguments: { url: "http://localhost:3000" },
      });

      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      expect(result.messages[0].role).toBe("user");

      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("http://localhost:3000");
      expect(text).toContain("create_session");
      expect(text).toContain("screenshot_web");
    },
    30_000
  );

  it(
    "gets accessibility-check prompt with url argument",
    async () => {
      const result = await ctx.client.getPrompt({
        name: "accessibility-check",
        arguments: { url: "http://localhost:4000" },
      });

      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("http://localhost:4000");
      expect(text).toContain("audit_accessibility");
      expect(text).toContain("get_accessibility_tree");
    },
    30_000
  );

  it(
    "gets responsive-check prompt with url argument",
    async () => {
      const result = await ctx.client.getPrompt({
        name: "responsive-check",
        arguments: { url: "http://localhost:5000" },
      });

      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("http://localhost:5000");
      expect(text).toContain("resize_viewport");
      expect(text).toContain("375");
    },
    30_000
  );

  it(
    "prompt message text is interpolated with provided url",
    async () => {
      const result = await ctx.client.getPrompt({
        name: "smoke-test",
        arguments: { url: "https://example.com" },
      });

      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("https://example.com");
    },
    30_000
  );
});
