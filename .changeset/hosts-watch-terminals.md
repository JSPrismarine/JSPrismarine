---
"@jsprismarine/server": patch
---

Run the server under a host process when attached to a terminal on Node 26.4 or newer and show the terminal UI from `@jsprismarine/console`; everywhere else, including Docker and hosting panels, the plain line console is unchanged. Adds the `--watch`, `--no-tui`, and `--headless` flags and the `JSP_NO_TUI` environment variable. `pnpm run dev` now runs `prismarine --watch`, replacing the `dev.mts` supervisor.
