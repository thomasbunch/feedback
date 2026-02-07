# Feedback

An MCP server that gives Claude Code eyes and hands for GUI development. When Claude builds a web app, Electron app, or Windows desktop application, Feedback launches the app, captures screenshots, interacts with the UI (click buttons, fill forms, navigate), captures errors and logs, and runs multi-step QA workflows with assertions — so Claude can iterate until the GUI actually works.

## Why

Claude Code currently has no way to see the visual output of GUI code it writes. This leads to blind iteration cycles where the user must describe what's wrong. Feedback closes the loop: Claude writes code, launches the app, takes a screenshot, verifies the result, and fixes issues — all autonomously.

## Install

```bash
npm install -g auto-feedback
```

Then install Playwright browsers (required for web/Electron automation):

```bash
npx playwright install chromium
```

## Configure with Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "feedback": {
      "command": "auto-feedback",
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
      "args": ["auto-feedback"]
    }
  }
}
```

Restart Claude Code after adding the configuration. You should see Feedback's 23 tools available.

## What It Does

### Session Management

Every interaction starts with creating a session. Sessions track all resources (processes, browsers, screenshots, logs) and clean up everything when ended.

### Launch Apps

- **Web dev servers** — Launch `npm start`, `vite`, `webpack`, `next dev`, etc. Automatically detects when the server is ready via stdout pattern matching and TCP port polling.
- **Electron apps** — Launch and connect Playwright for full automation.
- **Windows .exe files** — Launch native desktop apps and track their process.

### Take Screenshots

- **Web/Electron** — Playwright-based screenshots with full-page or viewport modes.
- **Desktop apps** — Native window capture by PID.
- **Auto-capture** — Automatically captures screenshots after page navigation events.
- **Optimized** — All screenshots resized and compressed to WebP for fast MCP transport.

### Interact with UI

- **Click elements** — By CSS selector, text content, role, or test ID. Returns a post-click screenshot.
- **Type text** — Fill inputs with paste or per-keystroke typing. Auto-waits for element readiness.
- **Navigate** — Go to URLs, browser back/forward. Updates page tracking automatically.
- **Read state** — Get element text, visibility, enabled/disabled, attributes, bounding box.
- **Wait for elements** — Wait for elements to become visible, hidden, attached, or detached.

### Capture Errors & Logs

- **Console logs** — Browser console output (log, error, warn) per session.
- **Runtime errors** — Uncaught exceptions and page crashes.
- **Network traffic** — HTTP requests/responses with status codes and timing.
- **Process output** — stdout/stderr from dev servers and executables.

### Run QA Workflows

Execute multi-step sequences with per-step screenshots and log capture:

```
run_workflow: [
  { action: "navigate", url: "http://localhost:3000" },
  { action: "click", selector: "#login-button" },
  { action: "type", selector: "#email", text: "user@example.com" },
  { action: "type", selector: "#password", text: "password123" },
  { action: "click", selector: "role=button[name='Sign In']" },
  { action: "assert", selector: ".welcome-message", assertType: "text-contains", expected: "Welcome" }
]
```

Each step captures a screenshot and log deltas. Failed steps stop the workflow with diagnostic context.

### Assert UI State

13 assertion types for verifying application behavior:

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

## All 23 Tools

| # | Tool | Purpose |
|---|------|---------|
| 1 | `get_version` | Server version and capabilities |
| 2 | `create_session` | Start a new testing session |
| 3 | `list_sessions` | List active sessions |
| 4 | `end_session` | End session and clean up resources |
| 5 | `check_port` | Check if a port is available |
| 6 | `launch_web_server` | Start a web dev server |
| 7 | `launch_electron` | Launch an Electron app |
| 8 | `launch_windows_exe` | Launch a Windows executable |
| 9 | `stop_process` | Stop all processes in a session |
| 10 | `screenshot_web` | Screenshot a web page by URL |
| 11 | `screenshot_electron` | Screenshot an Electron app |
| 12 | `screenshot_desktop` | Screenshot a desktop app window |
| 13 | `get_screenshot` | Get latest auto-captured screenshot |
| 14 | `click_element` | Click an element on the page |
| 15 | `type_text` | Type into an input field |
| 16 | `navigate` | Navigate to URL or back/forward |
| 17 | `get_element_state` | Read element properties |
| 18 | `wait_for_element` | Wait for element state change |
| 19 | `get_console_logs` | Get browser console output |
| 20 | `get_errors` | Get runtime errors and crashes |
| 21 | `get_network_logs` | Get HTTP request/response logs |
| 22 | `get_process_output` | Get process stdout/stderr |
| 23 | `run_workflow` | Execute multi-step QA workflow |

## Typical Flow

```
create_session
  -> launch_web_server (npm run dev on port 3000)
  -> screenshot_web (http://localhost:3000)
  -> click_element (#submit-button)
  -> type_text (#search-input, "hello world")
  -> run_workflow (multi-step test with assertions)
  -> get_console_logs (check for errors)
  -> stop_process (clean up)
  -> end_session
```

## Requirements

- **Node.js** >= 18.0.0
- **Playwright Chromium** — installed via `npx playwright install chromium`
- **Windows** — required for desktop app screenshots and .exe launching (web/Electron work on all platforms)

## Tech Stack

- TypeScript/Node.js with ESM
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) for Claude Code integration
- [Playwright](https://playwright.dev/) for web and Electron automation
- [Sharp](https://sharp.pixelplumbing.com/) for screenshot optimization (WebP)
- [node-screenshots](https://github.com/nicehash/node-screenshots) for native desktop capture

## License

MIT
