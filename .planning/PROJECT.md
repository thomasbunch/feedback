# Feedback

## What This Is

An MCP server for Claude Code that gives it eyes and hands for GUI development. It launches web apps, Electron apps, and Windows desktop applications, captures screenshots, interacts with the UI (click, type, navigate, read state), captures errors and logs, and runs multi-step QA workflows with assertions. Claude can autonomously build, see, interact with, and verify GUI applications.

## Core Value

Claude can autonomously build, verify, and fix GUIs without the user needing to be the eyes — see it, interact with it, confirm it works.

## Requirements

### Validated

- MCP server that Claude Code can connect to via standard MCP configuration — v1.0
- Launch and manage app processes (dev servers, Electron apps, Windows .exe files) — v1.0
- Take screenshots of running applications on demand and automatically on changes — v1.0
- Interact with web/Electron UIs: click elements, type text, navigate pages, read element state (via Playwright) — v1.0
- Capture build errors, console logs, runtime exceptions, and network requests — v1.0
- Run multi-step QA workflows: execute a sequence of interactions and verify outcomes at each step — v1.0
- Report QA results as pass/fail with screenshot evidence at each step — v1.0
- Installable as npm package with simple MCP config setup — v1.0

### Active

- [ ] Interact with C# desktop apps: click at screen coordinates, simulate keyboard input
- [ ] Desktop window management: focus, resize, minimize/maximize
- [ ] Read desktop element state via Windows UI Automation APIs
- [ ] Self-healing element location using visual similarity when selectors break
- [ ] Multi-browser support (Firefox, WebKit) beyond Chromium

### Out of Scope

- Mobile app testing (iOS/Android) — different automation stack (Appium), massive scope expansion
- Visual regression testing (pixel-diff comparisons) — too many false positives, not core to feedback loop
- Test script persistence/management — Claude generates interactions on the fly, not stored test suites
- CI/CD integration — this is a development-time tool for Claude Code, not a CI runner
- Video recording — storage intensive; strategic screenshots at checkpoints provide 80% value
- Cloud browser grid — scope creep; BrowserStack exists for this

## Current Milestone: v1.1 Stabilization

**Goal:** Systematically test every MCP tool, identify failures, and fix all broken functionality.

**Target features:**
- Test all 23 MCP tools end-to-end with real applications
- Fix Electron screenshot and other known broken tools
- Ensure all tool categories work: sessions, process lifecycle, screenshots, interaction, diagnostics, workflows
- Validate cross-tool flows (launch → screenshot → interact → verify)

## Context

Shipped v1.0 with 5,009 lines of TypeScript across 44 source files.
Tech stack: TypeScript/Node.js, MCP SDK, Playwright, Sharp, node-screenshots.
23 MCP tools covering sessions, process management, screenshots, UI interaction, error capture, workflows, and assertions.
Built in 2 days (Feb 5-7, 2026) across 8 phases and 22 plans.
Multiple tools discovered broken post-launch — v1.1 focuses on stabilization before adding new features.

## Constraints

- **Tech stack**: TypeScript/Node for the MCP server — best MCP SDK support and Playwright is native to this ecosystem
- **Platform**: Must work on Windows (C# desktop support requires it), should also work on macOS/Linux for web/Electron
- **Distribution**: npm package named `feedback` — lowest friction for Claude Code users
- **MCP Protocol**: Must conform to the MCP server specification so Claude Code can discover and call tools
- **Performance**: Screenshots and interactions must be fast enough for iterative development (sub-second for screenshots, quick element interaction)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript/Node for MCP server | MCP SDK + Playwright ecosystem alignment | Good |
| Playwright for web/Electron automation | Industry standard, supports Electron natively, fast | Good |
| Coordinate-based clicking for C# desktop | Full UI Automation is heavy; screenshots + click-at-coords is simpler for v1 | Good (deferred to v2) |
| npm package distribution | Lowest friction install for Claude Code users | Good |
| Auto + on-demand screenshots | Auto-capture catches changes; on-demand lets Claude check states | Good |
| zod ^3.25.0 (not ^4.0.0) | MCP SDK v1.x requires Zod v3.x peer dependency | Good |
| Node16 ESM with .js extensions | Required for TypeScript ESM modules | Good |
| console.error only for logging | stdio transport uses stdout for MCP protocol | Good |
| crypto.randomUUID() for session IDs | Node built-in, cryptographically secure | Good |
| Structured errors (Error/Context/Suggested fix) | Human-readable with actionable guidance | Good |
| Best-effort cleanup (always resolves) | Cleanup failures should not block shutdown | Good |
| Dual readiness (stdout + TCP polling) | Fast for Vite/Next; reliable TCP fallback | Good |
| Flat Zod schema for workflow steps | Simpler for LLM callers than discriminated unions | Good |
| Assertion failures return {passed:false} | Assertions expected to fail; exceptions for unexpected errors only | Good |

---
*Last updated: 2026-02-07 after v1.1 milestone start*
