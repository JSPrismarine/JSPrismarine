---
"@jsprismarine/server": patch
---

Run the server under a host process when attached to a terminal on a Node that loads `node:ffi` (26.9 and later, or 26.4 and later with `--experimental-ffi`) and show the terminal UI from `@jsprismarine/console`; everywhere else, including Docker and hosting panels, the plain line console is unchanged. Adds the `--watch`, `--no-tui`, and `--headless` flags and the `JSP_NO_TUI` environment variable. `pnpm run dev` now runs `prismarine --watch`, replacing the `dev.mts` supervisor. `@jsprismarine/console` is an optional dependency, so an install on an older Node still works and only loses the UI.
