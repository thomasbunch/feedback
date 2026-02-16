# Feedback

## What This Is

An MCP server for Claude Code that gives it eyes and hands for GUI development. It launches web apps, Electron apps, Tauri apps, and Windows desktop applications, captures screenshots, interacts with the UI (click, type, navigate, select, press keys, hover, scroll, drag-and-drop, file upload), evaluates JavaScript, manages browser dialogs/viewport/storage, intercepts network requests, manages tabs, audits accessibility, compares screenshots for visual regressions, inspects CSS properties, captures errors and logs, exposes data as MCP Resources/Prompts, and runs multi-step QA workflows with 19 assertion types. All 43 MCP tools are tested with 279 automated tests.

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
- Automated test suite (vitest) with tests for all 23 MCP tools — v1.1
- Integration tests exercising cross-tool flows (launch -> screenshot -> interact -> verify) — v1.1
- Test fixtures: sample web, Electron, and Windows apps for testing against — v1.1
- All session management tools verified (get_version, create/list/end_session) — v1.1
- All process lifecycle tools verified (check_port, launch_web/electron/exe, stop_process) — v1.1
- All screenshot tools verified (screenshot_web/electron/desktop, get_screenshot) — v1.1
- All UI interaction tools verified (click, type, navigate, get_state, wait) — v1.1
- All diagnostic tools verified (console_logs, errors, network_logs, process_output) — v1.1
- Workflow engine and all 13 assertion types verified — v1.1
- Select dropdown options, press keyboard keys, hover elements, scroll page/elements — v1.2
- Extract page text/HTML, element-level screenshots, execute JavaScript, accessibility tree — v1.2
- Handle browser dialogs, resize viewport with device emulation, wait for conditions, manage storage — v1.2
- File upload, drag-and-drop, network interception/mocking, multi-tab management — v1.2
- axe-core accessibility audit, screenshot pixel-diff comparison, CSS property inspection — v1.2
- MCP Resources (feedback:// URIs), MCP Prompts (QA templates), MCP Progress Notifications — v1.2
- Workflow engine: 7 new action types + 6 new assertion types (19 total) — v1.2
- Tauri app launch, screenshot, and full tool parity via shared getActivePage — v1.2
- Shared tool-helpers module eliminating duplicated logic across 38 tool files — v1.2
- All known bugs fixed with regression tests, edge cases hardened with .min(1) validation — v1.2

### Active

(None yet — define requirements in next milestone with `/gsd:new-milestone`)

Previously considered (deferred to future milestones):
- Interact with C# desktop apps: click at screen coordinates, simulate keyboard input
- Desktop window management: focus, resize, minimize/maximize
- Read desktop element state via Windows UI Automation APIs
- Self-healing element location using visual similarity when selectors break
- Multi-browser support (Firefox, WebKit) beyond Chromium
- Session resilience: browser crash detection, collector caps, framework-aware waits
- Content settling: MutationObserver DOM stability, animation disabling, HMR-aware timing
- Advanced architecture: plugin system, session persistence, event streaming
- iframe interaction and shadow DOM traversal

### Out of Scope

- Mobile app testing (iOS/Android) — different automation stack (Appium), massive scope expansion
- Full ML-powered semantic visual diff — pixel-diff comparison covers 90% of use cases
- Test script persistence/management — Claude generates interactions on the fly, not stored test suites
- CI/CD integration — this is a development-time tool for Claude Code, not a CI runner
- Video recording — storage intensive; strategic screenshots at checkpoints provide 80% value
- Cloud browser grid — scope creep; BrowserStack exists for this
- Natural language selectors — adds 2-5s latency; Claude generates CSS selectors naturally
- Full Lighthouse performance audit — 10-30s per run; Core Web Vitals via evaluate_javascript is lighter
- Record and replay — creates brittle recordings; Claude generates workflows programmatically

## Context

Shipped v1.2 with 9,538 lines of TypeScript across 69 files.
Tech stack: TypeScript/Node.js, MCP SDK, Playwright, Sharp, node-screenshots, vitest, @axe-core/playwright, pixelmatch.
43 MCP tools covering sessions, process management, screenshots, UI interaction, page control, quality auditing, MCP protocol, workflows, and Tauri support.
279 automated tests across 49 test files with 3 fixture apps.
Built across 3 milestones: v1.0 (Feb 5-7), v1.1 (Feb 7-8), v1.2 (Feb 12-15, 2026).
All tools verified working end-to-end. 3 bugs found and fixed during v1.2 stabilization.

## Constraints

- **Tech stack**: TypeScript/Node for the MCP server — best MCP SDK support and Playwright is native to this ecosystem
- **Platform**: Must work on Windows (C# desktop support requires it), should also work on macOS/Linux for web/Electron
- **Distribution**: npm package named `auto-feedback` — lowest friction for Claude Code users
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
| vitest 4.0 with forks pool | Process isolation for test reliability | Good |
| In-memory MCP test client | Bypass stdio transport for faster, more reliable tests | Good |
| Polling-based window detection | Replaced flaky 2s sleep with 500ms polling, 10s timeout | Good |
| Collectors attach before page.goto() | Captures initial page load events without workarounds | Good |
| rekeyIdentifier for atomic map re-keying | Consistent page ref and collector map keys after navigate | Good |
| Data-only tools (get_page_content, evaluate_js) | createToolResult without screenshot for data extraction | Good |
| Element screenshots via selector parameter | Extend existing screenshot tools, not separate tools | Good |
| One-shot dialog handler pattern | Registers, fires once, auto-removes — no stale handlers | Good |
| feedback:// URI scheme for MCP Resources | Custom scheme for in-memory session data | Good |
| Best-effort progress notifications | sendProgress never throws — no-op without progressToken | Good |
| Route handlers in SessionManager Map | Lifecycle management alongside session state | Good |
| Popup tracking via SessionManager Set | Idempotent guard prevents duplicate listener registration | Good |
| Shared tool-helpers module | 4 utilities eliminating 239 lines of duplicated boilerplate | Good |
| .min(1) Zod validation for string params | Clear errors instead of cryptic Playwright failures | Good |
| Tauri reuses existing dependencies | No new deps needed — wait-on, tree-kill, spawnCrossPlatform | Good |

---
*Last updated: 2026-02-15 after v1.2 milestone*
