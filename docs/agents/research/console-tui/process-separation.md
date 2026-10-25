# Splitting the console from the server process

Research notes for moving console I/O out of the server process and building the console as an
OpenTUI terminal UI. Written 2026-10-25 against Node v26.12.1 on macOS. Every claim carries a
URL or a repository path. Items marked "unverified" were not confirmed against a primary source.

## 1. What the repository does today

- `packages/prismarine/src/Console.ts` runs `readline` inside the server process. It puts stdin
  in raw mode, treats Ctrl+C as a keypress that calls `server.shutdown()`, redraws the prompt
  under every log line (`writeAbovePrompt`), and completes command names. When stdin has no
  `setRawMode` (no TTY) it returns early and `write()` falls back to `process.stdout.write`.
- `packages/logger/src/transport.ts` (`PrismarineTransport`) buffers every record in an
  unbounded array until a console attaches, then replays. `Logger.emit` formats one ANSI line
  per record and hands transports `{ level, message, namespace, timestamp, formatted }`.
- `packages/server/scripts/dev.mts` is a supervisor. It spawns the server with
  `stdio: 'inherit'`, never touches stdin, stops the child with SIGTERM and SIGKILL after 10 s,
  calls `setRawMode(false)` after each child exit, and swallows SIGINT/SIGTERM/SIGHUP so the
  child drives shutdown. Its header explains why `node --watch` and `tsx watch` were rejected
  (stdin dies after a restart; see section 6).
- `packages/server/src/Server.ts` installs handlers for SIGSEGV/SIGHUP/SIGINT/SIGTERM and
  `uncaughtException`, loads four `.env` files with `process.loadEnvFile`, builds a
  `FileTransport`, and keeps the process alive with `setInterval(() => {}, 1 << 30)` because the
  RakNet socket and tick timer are `unref`ed (`packages/prismarine/src/Server.ts` line 583) and a
  headless server otherwise exits after `listen`.
- `packages/prismarine/src/Server.ts` already has a `headless` constructor flag. It skips
  constructing `Console` and skips the `process.title` TPS update. `shutdown()` ends with
  `process.exit(...)` unless `stayAlive` is set.
- The `Dockerfile` runs Node as PID 1 with no TTY and relies on SIGTERM for a graceful stop.
  `docs/running.md` section 5 promises the console keeps working across dev restarts.
- `scripts/package-sea.mts` bundles `packages/server/src/Server.ts` to one CommonJS file with
  rolldown and builds it with `node --build-sea` (Node 25.5 or newer). The SEA main is CommonJS.

## 2. Node facts that decide the design

### Blocking writes

Node documents that `process.stdout` writes are synchronous to a TTY on POSIX and synchronous to
pipes on Windows, asynchronous to pipes and sockets on POSIX, and warns that "slow terminals"
can block the event loop "often enough and long enough to have severe negative performance
impacts" (https://github.com/nodejs/node/blob/main/doc/api/process.md, "A note on process I/O").
So on Linux the in-process console makes every log line a synchronous terminal write on the
server's event loop. Moving the terminal into another process turns those writes into async pipe
or socket writes. On Windows, pipe writes are synchronous, so a stalled console parent could
still block a server that writes to a pipe there; the IPC channel and `net` sockets are the
async paths on Windows (the IPC channel is a libuv pipe handle driven by `writeQueueSize`, see
below, not `process.stdout`).

### `process.send` queueing and backpressure

- `subprocess.send()` and `process.send()` return `false` "if the channel has closed or when the
  backlog of unsent messages exceeds a threshold that makes it unwise to send more"
  (https://github.com/nodejs/node/blob/main/doc/api/child_process.md, `subprocess.send`).
- The threshold is `channel.writeQueueSize < 65536 * 2` with the comment "If the primary is > 2
  read() calls behind, please stop sending"
  (https://github.com/nodejs/node/blob/main/lib/internal/child_process.js, `target._send`).
- Nothing is dropped. Messages queue in the sender's memory until the receiver reads. `'json'`
  mode frames each message as `JSON.stringify` plus `\n` and splits on `\n` on the way in;
  `'advanced'` mode prefixes a 4-byte big-endian length and uses the `node:v8` serializer
  (https://github.com/nodejs/node/blob/main/lib/internal/child_process/serialization.js). Node
  says advanced mode "performance may not be equivalent to that of JSON"
  (child_process.md, "Advanced serialization"). No documented message size limit exists for either
  mode; the limit is memory.
- Pending IPC writes are discarded by `process.exit()`. Node documents this for stdout
  (process.md, `process.exit()`); the benchmark below reproduced it for IPC: a child that called
  `process.exit` 50 ms after queueing 50 000 messages lost the tail, and exiting from the `send`
  callback fixed it.
- A Node child spawned with an `'ipc'` stdio entry starts with the channel `unref`ed until it
  registers a `'message'` or `'disconnect'` listener; after that the channel keeps the child
  alive. `process.channel.ref()`/`unref()` override this (child_process.md, "options.stdio" note;
  process.md, `process.channel`).
- "Accessing the IPC channel fd in any way other than `process.send()` or using the IPC channel
  with a child process that is not a Node.js instance is not supported" (child_process.md). An
  IPC-only protocol can never be spoken by a non-Node client or over a socket.

### `net` IPC paths

Unix domain socket paths are limited to about 103 bytes on macOS and 107 on Linux. A socket file
created by `net.createServer` is unlinked by `server.close()` but persists after a crash until
removed; Linux-only abstract sockets (`\0name`) vanish on their own. On Windows the path must be
under `\\?\pipe\` or `\\.\pipe\` (https://github.com/nodejs/node/blob/main/doc/api/net.md,
"Identifying paths for IPC connections").

### `worker_threads`

A worker is a thread in the same process. Its `process.stdin/stdout/stderr` are message ports
proxied through the main thread, and Node documents that worker stdio "can get blocked by
synchronous code on the receiving end that is blocking the Node.js event loop"
(https://github.com/nodejs/node/blob/main/doc/api/worker_threads.md, "Synchronous blocking of
stdio"). A TUI in a worker would therefore stall whenever the server's main thread is busy, and a
server crash takes the TUI down with it. It fails the responsiveness goal.

### Signals

- SIGINT "is not generated when terminal raw mode is enabled"; whichever process owns raw mode
  sees Ctrl+C as a byte.
- SIGTERM "is not supported on Windows, it can be listened on". On Windows `process.kill(pid,
  'SIGTERM')` terminates the target unconditionally. SIGHUP is generated when a Windows console
  window closes and the process is killed about 10 s later. SIGBREAK is the Windows Ctrl+Break.
  (https://github.com/nodejs/node/blob/main/doc/api/process.md, "Signal events".)
- `options.detached` makes the child a session leader on POSIX and gives it its own console
  window on Windows; a child with inherited stdio "will remain attached to the controlling
  terminal" regardless (child_process.md, `options.detached`).

### Raw mode

`readStream.setRawMode(mode)` now accepts `true`, `'raw'`, `'io'`, or `false`, and exposes
`isRaw` (https://github.com/nodejs/node/blob/main/doc/api/tty.md). The kernel keeps termios
state per TTY, not per process, so a child that dies in raw mode leaves the terminal raw for the
parent and the shell. `dev.mts` already compensates with `restoreTerminal()`.

### `node --watch`

`lib/internal/main/watch_mode.js` spawns the entry with `stdio: 'inherit'` (plus `'ipc'` when
filtering modules), kills it with the `--watch-kill-signal` (default SIGTERM, flag added in
v22.18.0/v24.4.0), prints "Restarting ..." with `process.stdout.write`, and forwards SIGTERM and
SIGINT to the child (https://github.com/nodejs/node/blob/main/lib/internal/main/watch_mode.js;
https://github.com/nodejs/node/blob/main/doc/api/cli.md). The terminal state issue the dev
supervisor cites, nodejs/node#35536 "Background node process corrupts terminal state with
tcsetattr() on exit", is still open (https://github.com/nodejs/node/issues/35536), as is
privatenumber/tsx#163 "Can't use stdin in watch mode" (https://github.com/privatenumber/tsx/issues/163).

### `process.loadEnvFile`

Stable since v22.21.0 and v24.10.0; defaults to `./.env`; `NODE_OPTIONS` inside the file has no
effect (process.md, `process.loadEnvFile`). Nothing stops both processes calling it; whether the
console process needs the server's `.env` at all is a design choice (see section 7).

### Single executable applications

- `sea.isSea()` reports whether the current script is inside a SEA; user arguments start at
  `process.argv[2]`; `execArgv` is fixed in the SEA config, extended by `NODE_OPTIONS` by default
  (`execArgvExtension: "env"`); `mainFormat` is `"commonjs"` by default and may be `"module"`
  (https://github.com/nodejs/node/blob/main/doc/api/single-executable-applications.md).
- Inside a SEA, `process.execPath` is the binary itself. Spawning `process.execPath` with a role
  argument therefore re-enters the bundled main, which is how one binary plays both roles.
  `child_process.fork(modulePath)` would pass the module path as `argv[2]` to the bundled main
  instead of running it, so the SEA should use `spawn(process.execPath, ['server', ...], { stdio:
  [..., 'ipc'] })`; Node enables `process.send` in any Node child that has an `'ipc'` stdio entry
  (child_process.md, `options.stdio`). Unverified: that `'ipc'` is honored when the child is a SEA
  binary rather than plain `node`; needs a test build.
- `node:ffi` is experimental, `--no-experimental-ffi` was added in v26.1.0 and the flag "is only
  available in builds with FFI support" (cli.md). `ffi.dlopen(path)` takes a file system path
  (https://github.com/nodejs/node/blob/main/doc/api/ffi.md), so a native library must exist on
  disk; a SEA has to ship it beside the binary or extract it from an asset at first run.

### OpenTUI runtime requirements

`@opentui/core` "runs on Bun 1.3.14 or later, or on Node.js 26.4.0 or later with ECMAScript
modules (ESM) and `--experimental-ffi`"; the renderer is written in Zig and called through FFI;
the per-platform native packages such as `@opentui/core-linux-x64` are "internal distribution
surfaces" (https://github.com/sst/opentui/blob/main/packages/core/README.md). This conflicts with
two current facts: the repository's `engines.node` is `>=22.18.0` (`package.json`), and the SEA
main is CommonJS (`scripts/package-sea.mts`). The server can stay on Node 22; only the console
process needs Node 26.4+, which is another reason to keep it in its own process and its own
ESM bundle. Unverified: whether OpenTUI's Node path loads the native library from a path that a
SEA can provide; `packages/core/src/platform/runtime-assets.node.ts` only showed asset
resolution through `import.meta.resolve`.

## 3. Transport measurements

Script: `/tmp/jsp-research/bench/bench.mjs` (not committed). A child sends N records of about
250 bytes (`{ v, type, seq, level, namespace, timestamp, message, formatted }`) in a tight loop
while the parent counts them and checks `seq` order. The "stall" runs block the parent's event
loop with `Atomics.wait` for 2 s after the first record. Node v26.12.1, Apple Silicon, one run
each, so treat numbers as order-of-magnitude.

| Transport | N | Parent stalled | Child send loop | Parent received all | `false` returns | Child RSS | Ordered |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fork IPC `json` | 50 000 | no | 159 ms | 463 ms | 49 494 | 138 MiB | yes |
| fork IPC `advanced` | 50 000 | no | 383 ms | 606 ms | 49 069 | 157 MiB | yes |
| NDJSON over stdout pipe | 50 000 | no | 114 ms | 277 ms | 49 077 | 115 MiB | yes |
| NDJSON over Unix socket | 50 000 | no | 107 ms | 297 ms | 49 809 | 115 MiB | yes |
| fork IPC `json` | 50 000 | 2 s | 114 ms | 2 154 ms | 49 485 | 139 MiB | yes |
| NDJSON over Unix socket | 50 000 | 2 s | 67 ms | 2 125 ms | 49 809 | 115 MiB | yes |
| fork IPC `json` | 200 000 | no | 374 ms | 673 ms | 198 917 | 345 MiB | yes |
| fork IPC `advanced` | 200 000 | no | 381 ms | 641 ms | 191 553 | 409 MiB | yes |
| NDJSON over stdout pipe | 200 000 | no | 231 ms | 492 ms | 194 290 | 211 MiB | yes |
| NDJSON over Unix socket | 200 000 | no | 293 ms | 617 ms | 199 744 | 218 MiB | yes |

Baseline child RSS with 1 000 records was 56 MiB. Readings:

- Every transport moves 50 000 formatted log records in well under a second and keeps order.
  Throughput is not the deciding factor.
- `advanced` serialization is slower than `json` for this record shape, matching Node's warning.
  Records are strings and numbers; `json` mode is enough.
- Backpressure is advisory everywhere. `send()`/`write()` returned `false` for almost every call
  because the loop never yields, yet nothing was dropped and the sender never blocked. The cost
  is memory: 200 000 queued records cost roughly 150 to 350 MiB in the sender. A server that
  emits 50 000 lines in a second while the console is slow will grow until the server itself
  applies a cap. The server, not the transport, must bound the queue.
- A stalled receiver does not slow the sender's loop (send loop times are unchanged), which is
  the property the responsiveness goal needs in the other direction too: a busy server does not
  slow the console's render loop.

## 4. Topologies

### (a) Console/supervisor is the parent, server is the child

This is what `dev.mts` already is, minus the TUI and minus the pipes.

- Crash isolation: a server crash leaves the TUI up to show the stack and offer restart, which
  `dev.mts` already does ("server exited with code N, waiting for changes"). A TUI crash kills
  the server unless the child ignores the IPC `'disconnect'`; see risks.
- Restart: trivial, the parent already owns spawn and exit handling. Restart notices become TUI
  state instead of printed lines.
- TTY: the parent owns it exclusively. The child gets `stdin: 'ignore'` and is constructed with
  `headless: true`, so no process other than the TUI ever calls `setRawMode`, and the terminal
  cannot be left raw by a child crash.
- Headless/container: when `process.stdout.isTTY` is false the host should skip spawning and run
  the server in-process exactly as today, so `docker logs` keeps reading the server's own stdout
  and SIGTERM to PID 1 keeps working. No new moving part in containers.
- Signals: in raw mode Ctrl+C reaches the parent as a key; the parent sends a `shutdown` message
  (works on Windows where SIGTERM does not) and falls back to `child.kill('SIGTERM')` then
  SIGKILL after the existing 10 s grace. SIGTERM/SIGHUP to the parent are forwarded the same way,
  and the parent exits with the child's code once it ends, the way `watch_mode.js` and Next.js
  `next-dev.ts` do (https://github.com/vercel/next.js/blob/canary/packages/next/src/cli/next-dev.ts
  registers SIGINT/SIGTERM/SIGHUP handlers, kills the child, and SIGKILLs on timeout).
- SEA: one binary; `prismarine` with a TTY spawns `process.execPath server ...` and becomes the
  TUI; without a TTY it runs the server in-process. `node --watch` and Next.js both reuse
  `process.execPath` this way.
- Dev supervisor: the file watchers and bedrock-data regeneration from `dev.mts` move into the
  host behind a `--watch` flag. The host already has `child`, `restartQueued`, `shuttingDown`,
  `forceKillTimer`, debounce, and signal handling; the TUI reads them as status.

### (b) Server is the parent, console is the child

- Crash isolation is backwards: a server crash kills the console, so the stack trace and
  "restart?" UI disappear with it. The server would also have to respawn the console and route
  stdin to it, meaning the server process must still hold the TTY handle and pass it on
  (`stdio: 'inherit'` for the child), so the server stays attached to the terminal.
- Restart on file change needs a third process anyway.
- The only benefit is that the server's existing entry stays the main process. Nothing in the
  prior art does this. Rejected.

### (c) Independent processes joined by a socket (attach/detach)

tmux's model: "The server and each client are separate processes which communicate through a
socket in /tmp" (https://github.com/tmux/tmux/blob/master/tmux.1). pm2 does the same with a
detached daemon spawned with `stdio: [null, out, err, 'ipc']` and clients talking over
`$PM2_HOME/rpc.sock` and `pub.sock`, mapped to `\\.\pipe\rpc.sock` on Windows
(https://github.com/Unitech/pm2/blob/master/lib/Client.js;
https://github.com/Unitech/pm2/blob/master/paths.js). Paper exposes RCON via `enable-rcon`,
`rcon.port` and `rcon.password`, plus the newer `management-server-enabled`
(https://docs.papermc.io/paper/reference/server-properties/).

- Crash isolation is best: either side can die and the other continues; a console can be opened
  later against a running server.
- Costs: socket lifecycle (stale socket file after a crash on Unix; named pipe names on Windows),
  authentication for anything beyond a filesystem-permission-protected local socket, a replay
  buffer in the server so a late console sees recent history (Wings replays
  `websocket_log_count`, default 150 lines, from `docker logs --tail` on connect:
  https://github.com/pterodactyl/wings/blob/develop/config/config.go;
  https://github.com/pterodactyl/wings/blob/develop/router/websocket/websocket.go), and a
  supervisor is still needed for restart-on-change and crash restart, so the dev flow becomes
  three processes.
- With no console attached the server must still write to stdout for containers, which it does
  today.

### Verdict

(a) first, with the wire protocol framed as NDJSON on a stream so (c) can be added later by
having the server also `listen` on a socket and the host (or a `prismarine attach` command)
`connect` to it. Choosing `process.send` as the only carrier would block that path because Node
does not support speaking the IPC channel from anything but a Node child (section 2).

## 5. Transport choice

| Option | For | Against |
| --- | --- | --- |
| `fork`/`spawn` IPC, `json` | Lifecycle for free (`exit`, `disconnect`, exit code), `send()` returns `false` as a backpressure hint, framing done by Node, async on Windows too | Node-child only; cannot be reused for attach; `advanced` buys nothing here |
| NDJSON on an extra pipe fd (`stdio: [..., 'pipe']`) | Same code path as a socket, works for any runtime (Bun server, Node console) | Synchronous writes on Windows pipes (process.md); no `false` hint beyond `write()`'s return |
| NDJSON on Unix socket / named pipe | Attach/detach, multiple consoles, non-Node clients | Socket file cleanup, Windows naming, auth |
| `worker_threads` | None for this goal | Same process, stdio proxied through main thread, blocked by a busy loop |

Recommendation: write the protocol against a `Duplex`-like interface that takes and yields
decoded messages, with two adapters. The first adapter wraps the IPC channel (`process.send` /
`subprocess.send`, `json` mode) and is what the host uses for the child it spawned. The second
wraps a `net.Socket` with NDJSON framing and is only needed when attach lands. Keep message
bodies JSON-only (strings, numbers, booleans, plain objects) so both adapters carry the same
types. Treat `send() === false` as "pause until the callback fires" in the server adapter.

## 6. Prior art and what transfers

- Paper, Velocity, Nukkit all extend `SimpleTerminalConsole` from TerminalConsoleAppender, which
  runs JLine in-process on a dedicated console thread and redraws the prompt under log output
  (https://github.com/Minecrell/TerminalConsoleAppender/blob/master/README.md;
  https://github.com/PaperMC/Paper/blob/main/paper-server/src/main/java/com/destroystokyo/paper/console/PaperConsole.java;
  https://github.com/PaperMC/Velocity/blob/dev/3.0.0/proxy/src/main/java/com/velocitypowered/proxy/console/VelocityConsole.java;
  https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/console/NukkitConsole.java).
  Nukkit's `runCommand` pushes to a `consoleQueue` or schedules onto the main thread. Transfer:
  the console only ever submits command strings; the server executes them on its own loop and
  reports back. Java gets responsiveness from a thread; Node needs a process for the same effect.
  PowerNukkitX is a Nukkit fork; its console class was not fetched (unverified, assumed same).
- PocketMine-MP delegates stdin reading to a child PHP process connected by a socket because
  `stream_select()` on stdin misbehaves on Windows and a blocking read stuck shutdown; the child
  sends a heartbeat line even when idle and kills itself when the parent is gone
  (https://github.com/pmmp/PocketMine-MP/blob/stable/src/console/ConsoleReaderChildProcessDaemon.php;
  https://github.com/pmmp/PocketMine-MP/blob/stable/src/console/ConsoleReaderChildProcess.php).
  Transfer: the orphan check. Whichever side is the child must notice the parent is gone
  (`'disconnect'` on the IPC channel) and shut itself down.
- Bedrock Dedicated Server reads commands as plain lines on stdin with no TUI; Microsoft's guide
  says "When the server is running, you can enter commands on the console"
  (https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/getting-started).
  The itzg container wraps it with `docker attach` and a `send-command` script
  (https://github.com/itzg/docker-minecraft-bedrock-server). Transfer: the headless server must
  keep accepting plain stdin lines so panels and containers keep working.
- Pterodactyl Wings attaches to the container's stdin/stdout/stderr
  (`ContainerAttach` with `Stdin/Stdout/Stderr: true`), relays lines to panel websockets, replays
  the last `websocket_log_count` lines on connect, and throttles output at `lines: 2000` per
  `line_reset_interval: 100` ms, publishing a "Server is outputting console data too quickly --
  throttling..." notice (https://github.com/pterodactyl/wings/blob/develop/environment/docker/container.go;
  https://github.com/pterodactyl/wings/blob/develop/server/console.go;
  https://github.com/pterodactyl/wings/blob/develop/config/config.go). Transfer: rate cap with a
  visible notice instead of silent drops; a bounded replay buffer.
- pm2: detached daemon plus Unix-socket RPC and pub/sub (section 4c). Transfer: socket paths per
  platform, `\\.\pipe\` on Windows.
- `node --watch`: inherited stdio, SIGTERM, "Restarting" lines; stdin problem still open
  (section 2). Transfer: the kill-signal grace pattern, which `dev.mts` already has.
- Vite binds key shortcuts with `readline.createInterface({ input: process.stdin })` in the dev
  server process and does not use raw mode
  (https://github.com/vitejs/vite/blob/main/packages/vite/src/node/shortcuts.ts). Not a model for
  a saturated-loop server.
- Next.js `next dev` forks the real server (`fork(startServerPath, { stdio: 'inherit' | ['inherit',
  'pipe', 'pipe', 'ipc'], execArgv })`), passes options over IPC after a `nextWorkerReady`
  message, restarts on a dedicated `RESTART_EXIT_CODE`, and forwards SIGINT/SIGTERM/SIGHUP with a
  SIGKILL fallback (https://github.com/vercel/next.js/blob/canary/packages/next/src/cli/next-dev.ts).
  Transfer: a reserved exit code the server uses to ask its supervisor for a restart; `hello` /
  `ready` handshake over IPC before the parent sends configuration.
- Turborepo runs each task in a PTY (`turborepo-process` `child.rs`, `PtySize`) and streams the
  bytes as `Event::TaskOutput { task, output: Vec<u8> }` over a tokio `mpsc` channel into a
  ratatui app that owns the terminal and reads input through its own crossterm stream; the
  `Event` enum also carries `Status`, `Resize`, `Input`, `SetStdin`, and `RestartTasks`
  (https://github.com/vercel/turborepo/blob/main/crates/turborepo-ui/src/tui/event.rs;
  https://github.com/vercel/turborepo/blob/main/crates/turborepo-ui/src/tui/app.rs;
  https://github.com/vercel/turborepo/blob/main/crates/turborepo-process/src/child.rs). Transfer:
  one event enum for everything the UI reacts to, with a bounded channel between producer and
  renderer.
- Bun: `--watch` hard-restarts the process and sends SIGTERM first; `--hot` swaps modules
  in-process without a restart (https://github.com/oven-sh/bun/blob/main/docs/runtime/watch-mode.mdx).
  Hot reload does not fit a server holding a UDP socket and world state; the watch model is the
  one `dev.mts` already implements.
- Docker: `docker attach` connects the terminal's stdin/stdout/stderr to the container's main
  process, detaches with Ctrl-p Ctrl-q only when run with `-it`, and Ctrl-C otherwise kills;
  `docker logs --follow` streams the container's STDOUT and STDERR
  (https://github.com/docker/cli/blob/master/docs/reference/commandline/container_attach.md;
  https://github.com/docker/cli/blob/master/docs/reference/commandline/container_logs.md).
  Transfer: headless mode must keep writing plain lines to stdout.

## 7. Protocol

### Message families

Server to console: `hello` (protocol version, server version, pid, capabilities), `log`,
`log.dropped` (count since last delivered record), `status` (tps, tick ms, players, memory,
uptime; sent at 1 Hz, coalesced), `chat`, `lifecycle` (`starting`, `running`, `stopping`,
`stopped`, `crashed`), `command.result` (per request id, so the TUI can mark a command as
finished or failed), `complete.result`.

Console to server: `command` (id, line), `complete` (id, line, cursor), `shutdown` (`crash`
false), `subscribe` (minimum level the console wants, so a console on `info` does not pay for
`silly` records the file transport still receives).

Host-internal (not on the wire, but part of the TUI's event union): `supervisor.changed` (path),
`supervisor.generating`, `supervisor.restartQueued`, `supervisor.restarting`,
`supervisor.exited` (code, signal), `supervisor.waiting`.

### Sketch

```ts
export const PROTOCOL_VERSION = 1 as const;

interface Envelope<T extends string> { v: typeof PROTOCOL_VERSION; type: T }

export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly';

export type ServerMessage =
    | (Envelope<'hello'> & { serverVersion: string; pid: number; capabilities: readonly string[] })
    | (Envelope<'log'> & { seq: number; level: LogLevel; namespace: string; at: number; message: string; formatted: string })
    | (Envelope<'log.dropped'> & { count: number })
    | (Envelope<'status'> & { tps: number; tickMs: number; players: number; rssBytes: number; uptimeMs: number })
    | (Envelope<'chat'> & { at: number; text: string })
    | (Envelope<'lifecycle'> & { state: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed' })
    | (Envelope<'command.result'> & { id: string; ok: boolean; error?: string })
    | (Envelope<'complete.result'> & { id: string; completions: readonly string[]; replace: string });

export type ConsoleMessage =
    | (Envelope<'command'> & { id: string; line: string })
    | (Envelope<'complete'> & { id: string; line: string; cursor: number })
    | (Envelope<'shutdown'> & { crash: boolean })
    | (Envelope<'subscribe'> & { level: LogLevel });

export type SupervisorEvent =
    | { type: 'supervisor.changed'; path: string }
    | { type: 'supervisor.generating' }
    | { type: 'supervisor.restartQueued' }
    | { type: 'supervisor.restarting' }
    | { type: 'supervisor.exited'; code: number | null; signal: NodeJS.Signals | null }
    | { type: 'supervisor.waiting' };
```

Keep `formatted` in `log` for now so the TUI can reuse `color-parser` output unchanged; a later
version can drop it once the TUI renders from `level`, `namespace`, and `message`, and the schema
version exists for that change. `at` is epoch milliseconds rather than today's `HH:mm:ss`
string so the TUI can format for the local zone and detect gaps. `seq` lets the console detect a
gap even if a `log.dropped` message is itself lost.

### Behavior with no console attached

- Headless (no TTY, or `--headless`): the server runs in-process and writes `formatted` to
  stdout as today, so `docker logs` and panel attach keep working. The `PrismarineTransport`
  replay buffer should get a cap (for example 1 000 records) with a dropped counter instead of
  the current unbounded array.
- Parented but console slow: a `ConsoleTransport` keeps a bounded ring (for example 5 000 records
  or a byte budget), sends while `send()` returns `true`, pauses on `false` until the callback,
  and emits `log.dropped` with the count of records that fell off the ring. This is Wings'
  throttle made explicit. The file transport is unaffected, so nothing is lost on disk.
- Parented and console gone (IPC `'disconnect'`): shut down gracefully. Without this a closed
  terminal leaves an orphan server bound to port 19132. When attach mode exists, a server
  started as a daemon opts out of this.

## 8. Node-specific gotchas

- Raw mode handoff: avoid it. Only the TUI process touches stdin. The child gets `stdin:
  'ignore'`. `dev.mts`'s `restoreTerminal()` then becomes unnecessary for the child and moves to
  the TUI's own exit path (`process.on('exit')`, `uncaughtException`, signal handlers) so the shell
  never inherits a raw terminal. Confirm OpenTUI restores termios on its own destroy path
  (unverified).
- `stdio`: `['ignore', 'pipe', 'pipe', 'ipc']` in TTY mode so stray `console.debug` output such as
  "Server stopped, Goodbye!" (`packages/prismarine/src/Server.ts` `shutdown`) lands in the TUI as
  a raw line instead of corrupting the screen. Headless mode does not spawn at all.
- `detached`: not needed for (a). For (c) a daemon needs `detached: true`, stdio redirected to
  files, and `subprocess.unref()`, the pm2 pattern.
- Keeping the child alive: once the server registers a `'message'` listener the IPC channel
  refs the loop (section 2), so the `setInterval(() => {}, 1 << 30)` is redundant in parented
  mode. It is still needed in headless mode, where nothing else is referenced. Either keep it or
  replace it with an explicit handle; do not remove it.
- `setRawMode` cleanup on crash: covered above; the server never enters raw mode.
- Windows: no SIGTERM, so `shutdown` over IPC must be the primary stop path; `subprocess.kill()`
  remains the hard fallback. Named pipe paths for attach mode. Pipe writes are synchronous on
  Windows, another reason to carry logs on the IPC channel rather than the child's stdout.
- `process.loadEnvFile`: call it in the host before spawning and pass `env` down, or call it in
  both. Passing it down is simpler and keeps `.env.development.local` semantics identical to
  today. The console itself needs almost nothing from the environment.
- `process.exit` and pending writes: the server must not `process.exit` until the final
  `lifecycle: stopped` message's `send` callback fires, or the TUI never sees it (section 3).
- Exit codes: a reserved code (Next.js uses `RESTART_EXIT_CODE`) lets a future `/restart`
  console command or a `reload` flow ask the host to respawn without the host having to parse
  logs.

## 9. Recommendation

Topology (a) now, framed for (c) later. One entry point decides its role:

1. No TTY on stdout, or `--headless`: run the server in-process, plain lines to stdout, SIGTERM
   as today. This is the container and panel path and changes nothing for them.
2. TTY present: the process becomes the host. It spawns `process.execPath` with a `server` role
   argument (plus the user's flags) and `stdio: ['ignore', 'pipe', 'pipe', 'ipc']`, runs the
   OpenTUI renderer, and owns raw mode. With `--watch` it also runs the watchers and bedrock-data
   regeneration from `dev.mts`, publishing `SupervisorEvent`s to the TUI.
3. The server, when it detects `process.send`, constructs `Server` with `headless: true`, adds a
   `ConsoleTransport` that speaks `ServerMessage` over the IPC channel with a bounded ring and
   `log.dropped`, executes `command` messages through `CommandManager.dispatchCommand` on its own
   loop, and shuts down on `shutdown` or IPC `'disconnect'`.
4. The protocol lives in a small shared module with the discriminated unions above and two
   stream adapters (IPC, NDJSON socket). Only the IPC adapter ships first.

Transport: IPC `json` mode. Protocol: the versioned unions in section 7.

## 10. Risks

- OpenTUI needs Node 26.4+ with FFI and ESM; the repository supports Node 22.18 and packages a
  CommonJS SEA. Either the console bundle is ESM with `mainFormat: "module"` and the SEA floor
  rises to 26.4, or the console runs under Bun and the SEA loses the TUI. Decide before building.
- OpenTUI's native library must be a file on disk for `dlopen`; a SEA has to carry and extract it.
  Unverified until a SEA build is tried.
- `'ipc'` stdio with a SEA child is unverified.
- Memory: without the ring cap, a log storm with a slow console grows the server's RSS by
  hundreds of MiB (section 3).
- Orphans: forgetting the `'disconnect'` shutdown leaves a port-bound server after the TUI dies.
- Double output: in TTY mode the server must not also print to its stdout, or every line appears
  twice (once raw, once as a `log` message). Make the stdout fallback conditional on headless.
- Windows signal gap: Ctrl+C in raw mode is a key, SIGTERM does not exist, so a hung server can
  only be stopped by `subprocess.kill()`; the host needs the existing 10 s force-kill.
- Attach mode later adds socket cleanup and authentication work; keep the message bodies
  JSON-only now so that adapter is a framing change rather than a protocol change.
- Startup latency: spawning a second Node process adds roughly the Node boot time before the
  first log appears; the TUI should show a `starting` state immediately so the gap is visible
  rather than silent. Not measured.
