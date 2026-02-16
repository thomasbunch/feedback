# Feedback

An MCP server that gives Claude Code eyes and hands for GUI development. When Claude builds a web app, Electron app, Tauri app, or Windows desktop application, Feedback launches the app, captures screenshots, interacts with the UI, audits quality, and runs multi-step QA workflows with assertions — so Claude can iterate until the GUI actually works.

## Why

Claude Code currently has no way to see the visual output of GUI code it writes. This leads to blind iteration cycles where the user must describe what's wrong. Feedback closes the loop: Claude writes code, launches the app, takes a screenshot, verifies the result, and fixes issues — all autonomously.

## Install

```bash
npm install -g get-feedback-mcp
```

Then install Playwright browsers (required for web/Electron/Tauri automation):

```bash
npx playwright install chromium
```

## Configure with Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "feedback": {
      "command": "get-feedback-mcp",
      "args": []
    }
  }
}
```

Or if installed locally in a project:

```json
{
  "mcpServers": {
    "feedback": {
      "command": "npx",
      "args": ["get-feedback-mcp"]
    }
  }
}
```

Restart Claude Code after adding the configuration. You should see Feedback's 43 tools available.

## What It Does

### Session Management

Every interaction starts with creating a session. Sessions track all resources (processes, browsers, screenshots, logs) and clean up everything when ended.

### Launch Apps

- **Web dev servers** — Launch `npm start`, `vite`, `webpack`, `next dev`, etc. Automatically detects when the server is ready via stdout pattern matching and TCP port polling.
- **Electron apps** — Launch and connect Playwright for full automation.
- **Tauri apps** — Launch and connect to WebView2 via CDP for automation (Windows).
- **Windows .exe files** — Launch native desktop apps and track their process.

### Take Screenshots

- **Web/Electron/Tauri** — Playwright-based screenshots with full-page, viewport, or element-level modes.
- **Desktop apps** — Native window capture by PID.
- **Auto-capture** — Automatically captures screenshots after page navigation events.
- **Optimized** — All screenshots resized and compressed to WebP for fast MCP transport.

### Interact with UI

- **Click elements** — By CSS selector, text content, role, or test ID. Returns a post-click screenshot.
- **Type text** — Fill inputs with paste or per-keystroke typing. Auto-waits for element readiness.
- **Select dropdowns** — By value, visible label, or numeric index.
- **Press keys** — Keyboard keys and combinations (Ctrl+A, Shift+Tab, Enter, Escape).
- **Hover** — Trigger menus, tooltips, and hover states.
- **Scroll** — Page or element scrolling by pixels, to position, or to bring an element into view.
- **Drag and drop** — Drag elements from source to target.
- **File upload** — Upload files to file input elements.
- **Navigate** — Go to URLs, browser back/forward. Updates page tracking automatically.
- **Read state** — Get element text, visibility, enabled/disabled, attributes, bounding box.
- **Wait for elements** — Wait for elements to become visible, hidden, attached, or detached.

### Page Control

- **Execute JavaScript** — Run arbitrary JS in the page context and receive serialized results.
- **Handle dialogs** — Auto-accept, dismiss, or respond to alert/confirm/prompt dialogs.
- **Resize viewport** — Set dimensions or use device presets (mobile, tablet, desktop).
- **Wait for conditions** — Wait for network idle, a JS expression to become truthy, or a URL pattern.
- **Manage storage** — Read/write cookies, localStorage, sessionStorage. Save/restore full state.
- **Manage tabs** — List, switch, open, close tabs. Automatic popup tracking.
- **Intercept network** — Mock API responses, block requests, modify headers.

### Quality Auditing

- **Accessibility audit** — Run axe-core WCAG audit with violations, severity, and fix suggestions.
- **Accessibility tree** — Capture the page's ARIA role/name hierarchy as structured text.
- **Screenshot comparison** — Pixel-by-pixel diff with mismatch percentage and visual diff image.
- **CSS inspection** — Read computed CSS property values for any element.

### Capture Errors & Logs

- **Console logs** — Browser console output (log, error, warn) per session.
- **Runtime errors** — Uncaught exceptions and page crashes.
- **Network traffic** — HTTP requests/responses with status codes and timing.
- **Process output** — stdout/stderr from dev servers and executables.

### MCP Protocol Integration

- **Resources** — Screenshots, console logs, errors, network logs, and session state exposed as MCP Resources with `feedback://` URIs (accessible via `@` syntax in Claude Code).
- **Prompts** — Pre-built QA scenario templates: smoke test, accessibility check, responsive check.
- **Progress** — Long-running operations emit progress notifications showing step-by-step completion.

### Run QA Workflows

Execute multi-step sequences with per-step screenshots and log capture:

```
run_workflow: [
  { action: "navigate", url: "http://localhost:3000" },
  { action: "click", selector: "#login-button" },
  { action: "type", selector: "#email", text: "user@example.com" },
  { action: "type", selector: "#password", text: "password123" },
  { action: "click", selector: "role=button[name='Sign In']" },
  { action: "assert", selector: ".welcome-message", assertType: "text-contains", expected: "Welcome" },
  { action: "assert", assertType: "a11y-passes" }
]
```

Each step captures a screenshot and log deltas. Failed steps stop the workflow with diagnostic context.

### Assert UI State

19 assertion types for verifying application behavior:

| Assertion | What it checks |
|-----------|---------------|
| `exists` | Element is in the DOM |
| `not-exists` | Element is not in the DOM |
| `visible` | Element is visible |
| `hidden` | Element is hidden or absent |
| `text-equals` | Element text matches exactly |
| `text-contains` | Element text contains substring |
| `has-attribute` | Element has the named attribute |
| `attribute-equals` | Attribute matches expected value |
| `enabled` | Element is enabled |
| `disabled` | Element is disabled |
| `checked` | Checkbox/radio is checked |
| `not-checked` | Checkbox/radio is not checked |
| `value-equals` | Input value matches expected |
| `css-equals` | Computed CSS property matches value |
| `url-equals` | Page URL matches exactly |
| `url-contains` | Page URL contains substring |
| `title-equals` | Page title matches exactly |
| `count-equals` | Number of matching elements equals N |
| `a11y-passes` | axe-core accessibility audit passes |

## All 43 Tools

| # | Tool | Purpose |
|---|------|---------|
| 1 | `get_version` | Server version and capabilities |
| 2 | `create_session` | Start a new testing session |
| 3 | `list_sessions` | List active sessions |
| 4 | `end_session` | End session and clean up resources |
| 5 | `check_port` | Check if a port is available |
| 6 | `launch_web_server` | Start a web dev server |
| 7 | `launch_electron` | Launch an Electron app |
| 8 | `launch_tauri` | Launch a Tauri app (Windows, CDP) |
| 9 | `launch_windows_exe` | Launch a Windows executable |
| 10 | `stop_process` | Stop all processes in a session |
| 11 | `screenshot_web` | Screenshot a web page (full page, viewport, or element) |
| 12 | `screenshot_electron` | Screenshot an Electron app (full page, viewport, or element) |
| 13 | `screenshot_tauri` | Screenshot a Tauri app |
| 14 | `screenshot_desktop` | Screenshot a desktop app window |
| 15 | `get_screenshot` | Get latest auto-captured screenshot |
| 16 | `click_element` | Click an element on the page |
| 17 | `type_text` | Type into an input field |
| 18 | `select_option` | Select a dropdown option |
| 19 | `press_key` | Press keyboard keys or combinations |
| 20 | `hover_element` | Hover over an element |
| 21 | `scroll` | Scroll page or element |
| 22 | `drag_drop` | Drag and drop between elements |
| 23 | `file_upload` | Upload files to a file input |
| 24 | `navigate` | Navigate to URL or back/forward |
| 25 | `get_element_state` | Read element properties |
| 26 | `wait_for_element` | Wait for element state change |
| 27 | `get_page_content` | Extract page text or HTML |
| 28 | `evaluate_javascript` | Execute JavaScript in page context |
| 29 | `handle_dialog` | Handle browser alert/confirm/prompt |
| 30 | `resize_viewport` | Resize viewport or emulate device |
| 31 | `wait_for_condition` | Wait for network/JS/URL conditions |
| 32 | `manage_storage` | Read/write cookies and storage |
| 33 | `manage_tabs` | List, switch, open, close tabs |
| 34 | `intercept_network` | Mock or block network requests |
| 35 | `audit_accessibility` | Run axe-core WCAG accessibility audit |
| 36 | `get_accessibility_tree` | Capture ARIA accessibility tree |
| 37 | `compare_screenshots` | Pixel-diff two screenshots |
| 38 | `get_css_property` | Read computed CSS properties |
| 39 | `get_console_logs` | Get browser console output |
| 40 | `get_errors` | Get runtime errors and crashes |
| 41 | `get_network_logs` | Get HTTP request/response logs |
| 42 | `get_process_output` | Get process stdout/stderr |
| 43 | `run_workflow` | Execute multi-step QA workflow |

## Typical Flow

```
create_session
  -> launch_web_server (npm run dev on port 3000)
  -> screenshot_web (http://localhost:3000)
  -> click_element (#submit-button)
  -> type_text (#search-input, "hello world")
  -> audit_accessibility (check WCAG compliance)
  -> run_workflow (multi-step test with assertions)
  -> get_console_logs (check for errors)
  -> stop_process (clean up)
  -> end_session
```

## Requirements

- **Node.js** >= 18.0.0
- **Playwright Chromium** — installed via `npx playwright install chromium`
- **Windows** — required for desktop app screenshots, .exe launching, and Tauri support (web/Electron work on all platforms)

## Tech Stack

- TypeScript/Node.js with ESM
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) for Claude Code integration
- [Playwright](https://playwright.dev/) for web, Electron, and Tauri automation
- [Sharp](https://sharp.pixelplumbing.com/) for screenshot optimization (WebP)
- [node-screenshots](https://github.com/nicehash/node-screenshots) for native desktop capture
- [axe-core](https://github.com/dequelabs/axe-core) for accessibility auditing
- [pixelmatch](https://github.com/nicehash/pixelmatch) for screenshot comparison

## License

MIT
