# @jsprismarine/server

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/server)](https://www.npmjs.com/package/@jsprismarine/server)

The `prismarine` command line: argument parsing, the host process that runs the server as a child, the `--watch` file watcher, and the choice between the terminal UI and the plain line console.

Run `prismarine` in a terminal on Node 26.9 or newer (or 26.4 with `--experimental-ffi`) and it
loads `@jsprismarine/console` and shows the UI. Anywhere else it runs the server in-process with
the plain console, where each stdin line is a command and each log record is a stdout line.
`--no-tui` or `JSP_NO_TUI=1` forces the plain console, `--headless` attaches no console at all,
and `--watch` restarts the server when workspace source or `packages/blocks/vanilla_overlay/` JSON
changes (`pnpm run dev` passes it). The flags and keys are documented in
[Running JSPrismarine](../../docs/running.md#4-console).
