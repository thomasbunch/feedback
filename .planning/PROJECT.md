# Feedback Loop MCP

## What This Is

An MCP server for Claude Code that gives it eyes and hands for GUI development. When Claude builds a web app, Electron app, or C# desktop application, this MCP launches the app, captures screenshots, lets Claude interact with the UI (click buttons, fill forms, navigate), captures all errors and logs, and enables Claude to iterate until the GUI actually works. It turns Claude from a blind coder into one that can see, touch, and verify what it builds.

## Core Value

Claude can autonomously build, verify, and fix GUIs without the user needing to be the eyes — see it, interact with it, confirm it works.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] MCP server that Claude Code can connect to via standard MCP configuration
- [ ] Launch and manage app processes (dev servers, Electron apps, Windows .exe files)
- [ ] Take screenshots of running applications on demand and automatically on changes
- [ ] Interact with web/Electron UIs: click elements, type text, navigate pages, read element state (via Playwright)
- [ ] Interact with C# desktop apps: take screenshots and click at screen coordinates
- [ ] Capture build errors, console logs, runtime exceptions, and network requests
- [ ] Run multi-step QA workflows: execute a sequence of interactions and verify outcomes at each step
- [ ] Report QA results as pass/fail with screenshot evidence at each step
- [ ] Support all three platforms: browser-based web apps, Electron apps, C# desktop (WPF/WinForms)
- [ ] Installable as npm package with simple MCP config setup

### Out of Scope

- Mobile app testing (iOS/Android) — different automation stack, defer to future
- Visual regression testing (pixel-diff comparisons) — useful but not core to the feedback loop
- Test script persistence/management — Claude generates interactions on the fly, not stored test suites
- CI/CD integration — this is a development-time tool for Claude Code, not a CI runner

## Context

- Claude Code currently has no way to see the visual output of GUI code it writes, leading to blind iteration cycles where the user must describe what's wrong
- MCP (Model Context Protocol) allows Claude Code to connect to external tool servers that extend its capabilities
- Playwright is the leading browser automation library, supports Chromium/Firefox/WebKit and Electron apps natively
- Windows UI Automation APIs exist for native desktop apps but are heavier; coordinate-based clicking is simpler and sufficient for v1 C# support
- The MCP SDK is well-supported in TypeScript/Node, which aligns with Playwright's ecosystem
- This tool would be used by developers who use Claude Code to build GUI applications and want Claude to self-verify its work

## Constraints

- **Tech stack**: TypeScript/Node for the MCP server — best MCP SDK support and Playwright is native to this ecosystem
- **Platform**: Must work on Windows (C# desktop support requires it), should also work on macOS/Linux for web/Electron
- **Distribution**: npm package — lowest friction for Claude Code users
- **MCP Protocol**: Must conform to the MCP server specification so Claude Code can discover and call tools
- **Performance**: Screenshots and interactions must be fast enough for iterative development (sub-second for screenshots, quick element interaction)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript/Node for MCP server | MCP SDK + Playwright ecosystem alignment | — Pending |
| Playwright for web/Electron automation | Industry standard, supports Electron natively, fast | — Pending |
| Coordinate-based clicking for C# desktop | Full UI Automation is heavy; screenshots + click-at-coords is simpler and sufficient for v1 | — Pending |
| npm package distribution | Lowest friction install for Claude Code users | — Pending |
| Auto + on-demand screenshots | Auto-capture catches changes; on-demand lets Claude check specific states | — Pending |

---
*Last updated: 2026-02-06 after initialization*
