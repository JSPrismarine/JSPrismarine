# Console TUI ballot

Candidate designs for moving the JSPrismarine console out of the server process and rebuilding it
on OpenTUI. Judges read the four research notes in this directory (`opentui.md`,
`process-separation.md`, `ux-design.md`, `repo-map.md`) and vote on each question below.

## Question 1: topology and framework

### Option A: host-first, plain `@opentui/core`

- One entry point. With a TTY on stdout (and Node >= 26.4), `prismarine` becomes the host: it
  spawns `process.execPath` with the same script plus a hidden `--role=server` argument (or env
  var), `stdio: ['ignore', 'pipe', 'pipe', 'ipc']`, runs the OpenTUI renderer, and alone owns raw
  mode. Without a TTY, with `--no-tui`, or on Node < 26.4, it runs the server in-process and writes
  plain lines to stdout as today.
- The server child is constructed `headless: true`, adds an IPC-backed console transport with a
  bounded ring buffer and `log.dropped`, runs `command` messages through `dispatchCommand`, and
  shuts down on `shutdown` or IPC `disconnect`.
- `packages/server/scripts/dev.mts` watchers and bedrock-data regeneration move into the host
  behind `--watch`; supervisor events render as a status segment and toasts.
- TUI built from plain `@opentui/core` renderables, organized as components (classes or factory
  functions) with a small store, no React or Solid, no JSX toolchain.
- Protocol: versioned discriminated unions, JSON-only bodies, stream adapter interface so an
  NDJSON socket adapter (attach mode) can come later.

### Option B: server-first, attachable socket

- The server stays the main process and always listens on a local Unix socket or Windows named
  pipe inside `JSP_DIR`. `prismarine console` (or `prismarine attach`) connects with the OpenTUI
  client. Multiple consoles may attach; the server replays the last N records on connect.
- Dev flow keeps `dev.mts` as a separate supervisor; it spawns the server and must also forward its
  own notices to the attached console (a second socket or a message relayed via the server).
- Plain `@opentui/core`.

### Option C: host-first, `@opentui/react`

- Same process topology and protocol as Option A, but the TUI is written as React function
  components with JSX, using `@opentui/react` and `react`.

## Question 2: where the protocol and transport code lives

- 2a. A new package `@jsprismarine/console-protocol` (types, codec, adapters) depended on by both
  `@jsprismarine/prismarine` (server side transport) and the TUI package.
- 2b. Inside the TUI package `@jsprismarine/console` as a subpath export, with `prismarine` depending
  on `@jsprismarine/console/protocol` (which would pull OpenTUI into the server's dependency tree).
- 2c. Inside `@jsprismarine/logger` next to `LogRecord`.

## Question 3: log pane rendering

- 3a. One `TextRenderable` per record inside a `ScrollBoxRenderable` with sticky scroll
  (simplest, measured 6 to 50 ms per update beyond 5 000 lines, 65 536 native object cap).
- 3b. Records in a JS ring buffer; a custom `LogView` component renders only the visible window
  into a bounded set of renderables (measured 0.2 to 0.5 ms per update), with its own scroll
  offset, follow mode, and new-lines badge.

## Question 4: fate of the readline console

- 4a. Keep `packages/prismarine/src/Console.ts` as the in-process fallback (non-TTY, `--no-tui`,
  Node < 26.4) but strip its raw-mode handling to a plain line reader.
- 4b. Delete it; the in-process fallback is output-only (plain stdout) with no interactive input.
- 4c. Keep it unchanged as the fallback.

## Question 5: Ctrl+C

- 5a. First press clears the input line; second press on an empty line stops the server, with a
  hint in the status bar.
- 5b. Single press stops the server, as today.

## Judging criteria

Weigh, in this order: meets the responsiveness goal under server overload; works headless in
containers without new moving parts; fits the SEA packaging path; modularity and ease of extending
the TUI; implementation effort and risk given the repository's constraints (Node floor 22.18,
Biome, JSDoc check, no JSX config, Node 26 in CI); prior art.
