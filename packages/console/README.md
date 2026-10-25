# @jsprismarine/console

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/console)](https://www.npmjs.com/package/@jsprismarine/console)

Terminal user interface for the JSPrismarine server console, built on [OpenTUI](https://opentui.com).

The server entry point in `@jsprismarine/server` imports this package lazily, and only when it has decided to run the UI: stdin and stdout are a terminal, `JSP_NO_TUI` and `--no-tui` are absent, and Node is 26.4 or newer. In every other situation the server uses its plain line console and this package is never loaded, so a Docker image or a hosting panel pays nothing for it. The UI talks to the server over the messages in `@jsprismarine/console-protocol`; nothing outside this package imports `@opentui/core`.

Requires Node.js 26.4.0 or later: OpenTUI calls its native renderer through `node:ffi`, which first shipped in that release. Older versions can't load the renderer, which is why the server falls back to the plain console instead of failing.

## Layout

Each component is a factory in its own file, `create<Name>(ctx, props)`, with a sibling `*.test.ts`. Logic that doesn't need a renderer (log windowing, history, completion, segment truncation) lives in plain modules with their own tests.

| Directory | Owns |
| --- | --- |
| `src/theme/` | Color roles resolved against the terminal's capabilities, and styled text with Minecraft `§` codes |
| `src/log/` | The log store (a ring buffer), the windowed view over it, line formatting, and badges |
| `src/input/` | The input bar, command history, and completion state |
| `src/status/` | The status bar, its segments, and toasts |
| `src/help/` | The help overlay generated from the key map |
| `src/app/` | Layout, breakpoints, focus, and wiring; exports `startConsole` |

## Tests

From the repository root, `pnpm exec vitest run packages/console` runs this package's tests. They render into OpenTUI's test renderer, so they need Node 26.4 or newer too.
