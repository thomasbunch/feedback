# Feedback MCP Server

## What This Is

An MCP server that gives Claude Code visual feedback on GUI applications. It captures screenshots, validates layouts, compares against design references, and performs interactive UI testing — for any GUI framework (Electron, C#/WPF, Rust/Tauri, etc.). It closes the loop so Claude can write UI code, see the result, and iterate without human intervention.

## Core Value

Claude Code can see what it built — autonomously screenshot, analyze, and fix GUI output without the user acting as middleman.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Launch any GUI application via configurable command (npm run dev, dotnet run, cargo run, etc.)
- [ ] Detect and target application windows by process name or window title
- [ ] Capture screenshots of running application windows and return images to Claude
- [ ] Click at coordinates within the application window
- [ ] Type text and send keyboard input to the application
- [ ] Scroll within the application window
- [ ] Compare current screenshot against a reference image/mockup and report differences
- [ ] Validate element positions, sizes, and detect overlap or layout issues
- [ ] Wait for application to be ready before capturing (configurable timeout)
- [ ] Stop/restart the application between iterations
- [ ] Work on Windows (primary) and macOS

### Out of Scope

- Linux support — defer to later, Windows + macOS first
- Browser-specific automation (Puppeteer/Playwright) — this is OS-level, framework-agnostic
- CI/CD integration — local development tool first
- Design system enforcement — compare against references, don't enforce rules
- Accessibility testing — separate concern, could be a future addition

## Context

- MCP (Model Context Protocol) servers extend Claude Code's capabilities with custom tools
- Claude Code can already read/write files and run commands, but cannot see rendered GUI output
- The primary pain point: building UI with Claude Code requires manual screenshot/feedback cycles that are slow and error-prone
- OS-level screen capture and input automation is the right abstraction for framework-agnostic support
- Windows is the primary development platform, macOS is secondary

## Constraints

- **Protocol**: Must conform to MCP server specification — Claude Code is the client
- **Platform**: Windows primary, macOS secondary — OS-level APIs differ significantly
- **Performance**: Screenshot capture and return must be fast enough for iterative development (sub-second target)
- **Image format**: Screenshots must be in a format Claude can analyze (PNG)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Framework-agnostic (OS-level capture) | Must work with Electron, C#, Rust, any GUI toolkit | — Pending |
| Granular tool design (launch, screenshot, click, compare) | Gives Claude flexibility to compose actions for any workflow | — Pending |
| Windows-first, macOS second | User's primary platform is Windows | — Pending |

---
*Last updated: 2026-02-06 after initialization*
