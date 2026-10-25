# Console TUI plan

Decided by three judges (`votes/judge-1.md`, `votes/judge-2.md`, `votes/judge-3.md`) on the
`ballot.md` options, all three voting Q1=A, Q2=2a, Q3=3b, Q4=4a, Q5=5a. The research notes in
this directory are the evidence. This file is the contract the implementation slices follow.

## Decision

- Host-first topology. The `prismarine` entry point decides its role at startup:
  - TUI mode when stdin and stdout are TTYs, `TERM` is not `dumb`, `CI` and `JSP_NO_TUI` are
    unset, `--no-tui` was not passed, and `await import('node:ffi')` succeeds. The process
    becomes the host: it spawns `process.execPath` with `process.execArgv`, the same script,
    the user's flags, and `--role server`, using `stdio: ['ignore', 'pipe', 'pipe', 'ipc']`. It
    lazily imports `@jsprismarine/console` and owns the terminal alone.
  - Plain mode otherwise: the server runs in-process with the line console (no raw mode) and
    plain stdout lines, so containers, panels, Node 22, and `docker logs` are unchanged. When the
    TUI gate fails for a reason the user would not expect (Node too old), print one line that
    names the reason before starting.
  - `--role server` (hidden flag): run the server `headless: true` and attach the remote console
    over the IPC channel.
- `--watch` moves the file watchers and bedrock-data regeneration from
  `packages/server/scripts/dev.mts` into the host; `dev.mts` becomes a thin launcher. Supervisor
  state (watching, change detected, generating, restart queued, restarting, exited, waiting)
  renders in the TUI as a status segment and toasts, never as log lines.
- Plain `@opentui/core` 0.6.8, pinned exactly, plus `@opentui/keymap` at the same version if it
  runs on Node without the React or Solid adapters. No React, no Solid, no JSX.
- New package `@jsprismarine/console-protocol` holds the message types and link adapters. Neither
  it nor `@jsprismarine/prismarine` depends on OpenTUI.
- Log pane is a windowed view over a JS ring buffer (3b), never one renderable per record.
- `packages/prismarine/src/Console.ts` becomes a line console: reads lines from stdin, writes
  lines to stdout, no raw mode, no prompt redraw, no completer.
- Ctrl+C in the TUI clears the input line; a second press on an empty line (within two seconds,
  shown as a status hint) stops the server; a press while the server is `stopping` force kills.

## Protocol (`packages/console-protocol`)

```ts
export const PROTOCOL_VERSION = 1;
// LogLevel comes from @jsprismarine/logger.
export interface LogEntry { seq: number; level: LogLevel; namespace: string; at: number; message: string; formatted: string }
export type ServerMessage =
    | { type: 'hello'; v: 1; serverVersion: string; pid: number }
    | ({ type: 'log'; v: 1 } & LogEntry)
    | { type: 'log.dropped'; v: 1; count: number }
    | { type: 'status'; v: 1; tps: number; tickMs: number; players: number; maxPlayers: number; rssBytes: number; uptimeMs: number }
    | { type: 'lifecycle'; v: 1; state: 'starting' | 'running' | 'stopping' }
    | { type: 'command.result'; v: 1; id: string; ok: boolean; error?: string }
    | { type: 'complete.result'; v: 1; id: string; completions: readonly string[]; replace: string };
export type ConsoleMessage =
    | { type: 'command'; v: 1; id: string; line: string }
    | { type: 'complete'; v: 1; id: string; line: string; cursor: number }
    | { type: 'shutdown'; v: 1 }
    | { type: 'subscribe'; v: 1; level: LogLevel };
export type SupervisorEvent =
    | { type: 'supervisor.state'; state: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed' | 'restarting' | 'waiting'; code?: number | null; signal?: string | null; generation: number }
    | { type: 'supervisor.watching'; root: string }
    | { type: 'supervisor.changed'; path: string }
    | { type: 'supervisor.generating'; ok?: boolean }
    | { type: 'supervisor.output'; stream: 'stdout' | 'stderr'; text: string };
export interface MessageLink<In, Out> {
    send(message: Out): boolean; // false means the channel asked for a pause; keep sending is allowed but the sender should cap its own queue
    onMessage(listener: (message: In) => void): () => void;
    onClose(listener: () => void): () => void;
    close(): void;
}
```

Adapters: `childProcessLink()` for the server side (`process.send`, `process.on('message')`,
`'disconnect'`), `subprocessLink(child)` for the host side, and `memoryLinkPair()` for tests.
Type guards `isServerMessage` and `isConsoleMessage` validate incoming JSON shapes.

`stopped` and `crashed` are derived by the host from the child's `exit` event (code and signal),
not from a final IPC message, because `shutdown()` exits before queued sends drain.

## Server side (`packages/prismarine/src/console/`)

`RemoteConsole` (a `Service`): takes a `MessageLink<ConsoleMessage, ServerMessage>`. It adds a
`LogTransport` to the logger that forwards records as `log` messages with a monotonically
increasing `seq`, kept in a bounded ring (5 000 records) while `send` returns `false`, and emits
`log.dropped` with the count that fell off. It runs `command` through
`CommandManager.dispatchCommand` with the server's `ConsoleSender` and replies `command.result`;
answers `complete` with `completeCommand` from `Console.ts`; sends `status` at 1 Hz (coalesced,
only while something changed or every 5 s); sends `lifecycle`; and on `shutdown` or link close
runs the normal graceful `server.shutdown()`. The server never writes log lines to its own stdout
in this mode. `process.exit` in `shutdown` must wait for the last `send` callback.

## Host (`packages/server/src/host/`)

- `ServerChild`: spawn, restart, SIGTERM then SIGKILL after 10 s, `shutdown` message first (works
  on Windows), exit code propagation, pipes child stdout and stderr as `supervisor.output`.
- `Watcher`: the watch and bedrock-data generation logic from `dev.mts`, emitting
  `SupervisorEvent`s instead of printing.
- `Supervisor`: state machine combining both; the single source of `SupervisorEvent`s.
- `tuiGate.ts`: the mode decision described above, with a reason string.
- Entry: `packages/server/src/Server.ts` dispatches on role and mode; `Cli.ts` gains `--no-tui`,
  `--watch`, `--headless`, and the hidden `--role`.
- Terminal safety: the host restores the terminal on `exit`, `uncaughtException`, and signals
  (leave alternate screen, mouse off, bracketed paste off, cursor on, raw mode off), and every
  renderer event handler is wrapped so a thrown error becomes a toast.

## TUI (`packages/console`)

Component contract: each component is a factory function in its own file,
`create<Name>(ctx: ConsoleContext, props): Renderable` where `ConsoleContext = { renderer, theme,
store, keymap }`. Each has a sibling `*.test.ts` on `createTestRenderer()`. Pure logic (windowing,
filters, history, completion selection, segment truncation) lives in plain modules with their own
tests and no OpenTUI import. Nothing outside `packages/console` imports `@opentui/core`.

Directories, one owner each: `src/theme/`, `src/log/` (store, window, line, view, separator,
badge), `src/input/` (bar, history, completer), `src/status/` (bar, segments, toasts), `src/help/`
(overlay from the keymap catalog), `src/app/` (layout, breakpoints, focus, wiring), `src/host/`
(the `startConsole(options)` entry the host calls). `src/index.ts` exports `startConsole` and the
option types only, and is edited by the app slice alone.

`startConsole({ server: MessageLink<ServerMessage, ConsoleMessage>, supervisor: { onEvent }, actions:
{ restart(), stop(), forceStop() }, mode: 'tui', historyFile?: string }): Promise<{ close(): Promise<void> }>`.

Layout, degradation rules, shortcuts, and theme roles follow `ux-design.md` sections 1, 5, and 6.
Styled text is built from `level`, `namespace`, and `message` (with `§` codes mapped to theme
colors), not by parsing `formatted`.

## Slices and order

Wave 1 (independent): protocol package; line console; TUI theme; TUI input bar and history;
TUI status bar, segments, and toasts; SEA spike (ESM main, asset extraction, self spawn with
`'ipc'`), report only.
Wave 2 (after protocol): remote console in prismarine; host modules and entry wiring; log store
and log view.
Wave 3 (after wave 2): app composition and `startConsole`; help overlay and keymap; dev launcher
replacement and `dev-smoke.exp` retirement; host integration test with a fake child.
Wave 4: docs (`docs/running.md`, READMEs, `Dockerfile` `JSP_NO_TUI`), changesets, baseline
cleanups, full lint and test.
