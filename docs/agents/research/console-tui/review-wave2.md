# Console TUI wave 2 review

Reviewed the committed state at `95bb07e01b` for `packages/server/src/{Server.ts,cli/Cli.ts,host/**}`,
`packages/prismarine/src/console/**`, the remote console wiring in `packages/prismarine/src/Server.ts`,
`packages/console/src/{app/**,startConsole.ts,help/**}`, and the four changesets added since
`1990d875c3`. Judged against `plan.md`, the judge amendments in `votes/judge-2.md` and
`votes/judge-3.md`, `AGENTS.md`, and `docs/versioning.md`. Findings already queued in
`review-wave1.md` are not repeated.

Working tree at review time: `packages/server/src/Server.ts` and `packages/server/src/host/frontends.ts`
are modified and `packages/server/src/host/frontends.test.ts` is untracked (another agent's work in
progress). At `HEAD`, `loadTuiFrontend` is a stub returning `undefined`, so the TUI path is inert
and a `tui` decision falls through to the in-process line console; the working tree replaces the
stub with the lazy `import('@jsprismarine/console')` and passes `historyFile` through `dataPath`.
Everything below is about `HEAD`.

## Checks run

| Check | Result |
| --- | --- |
| `pnpm exec biome lint <scope>` | 71 files, no diagnostics (same pre-existing 2.6.2 vs 2.6.3 schema warning as wave 1). |
| `pnpm exec prettier --check <scope>` | All files formatted. |
| `node scripts/check-jsdoc.mts` | Pass, no new exports without JSDoc. |
| `node scripts/check-unicode-escapes.mts` | Pass, 2315 files. |
| `node scripts/check-american-filenames.mts` | Pass. |
| `pnpm --filter server --filter console --filter prismarine run typecheck` | Pass. |
| `pnpm exec vitest run packages/server/src packages/prismarine/src/console packages/console/src` | 30 files, 304 tests pass on Node 26.12.1. |

Nothing in scope fails `pnpm run lint` or `pnpm run typecheck`.

## Counts

Bug 5, design 7, nit 10, lint failure 0.

## Findings by owner

### Server host (`packages/server/src/Server.ts`, `cli/`, `host/`)

1. **bug**, `packages/server/src/host/ServerChild.ts:129-137`. The child is declared gone on
   `'exit'`, but a spawn that fails (`EAGAIN`, `EMFILE`, a bad `execPath`) emits `'error'` and
   `'close'` and never `'exit'` (verified on Node 26.12: `error ENOENT`, `close -2 null`, no
   `exit`). The comment says both end in `'exit'`; they do not. `Supervisor.start` then sits in
   `starting` with a dead `child`, `stop()` arms SIGTERM and SIGKILL against a process that
   never existed, and the host never exits. Fix: listen on `'close'` (fires in both cases) and
   report `code ?? 1`; `subprocessLink` in the protocol package has the same `'exit'`
   dependency and should move to `'close'` too.
2. **bug**, `packages/server/src/host/Supervisor.ts:101`. `await this.options.spawnChild()` has
   no catch. A rejection (for instance `import('node:sea')` failing) leaves `spawning = true`
   forever, so `start`, `restart`, and `stop` all become no-ops and the host hangs in `starting`.
   Fix: wrap in try/catch, reset `spawning`, and either `setState('crashed')` then `waiting`
   under `--watch` or `exit(1)` otherwise; add a test with a rejecting `spawnChild`.
3. **bug** (Windows), `packages/server/src/host/Watcher.ts:151` and
   `packages/server/src/host/ServerChild.ts:101,163`. `spawnSync('pnpm', ...)` without
   `shell: true` fails with `ENOENT` on Windows (`pnpm.cmd`), so every `--watch` start reports
   `bedrock-data generation failed`; and `child.kill('SIGTERM')` on Windows is an unconditional
   terminate, so a graceful shutdown that takes longer than `shutdownGraceMs` (1 s) is cut off
   before the world saves. Fix: `process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'` (or
   `shell: true`), and on win32 skip the SIGTERM step and give the `shutdown` message the full
   `killGraceMs` before SIGKILL.
4. **design**, `packages/server/src/host/Watcher.ts:138-145,123` and
   `packages/server/src/Server.ts:127-138`. Generation runs through `spawnSync`, which blocks
   the host event loop: in TUI mode the renderer freezes, the `generating` toast cannot paint
   until the generator has finished, keypresses and child IPC messages queue up, and because
   `ui.attach` runs before `watcher.start()`, the first thing the user sees is a frozen screen
   for the length of a `pnpm` startup. The `if (this.generating) return` guard in
   `requestRestart` is unreachable for the same reason: a synchronous generator can never be
   observed mid-run. Fix: use async `spawn`, keep `generating` true across the await (which
   makes the guard real), and hold the debounce timers while it runs; or at least run the
   initial generation before `ui.attach`.
5. **design**, `packages/server/src/host/Supervisor.ts:198-199` and
   `packages/console/src/app/createApp.ts:433-490`. After a crash the supervisor always goes
   `crashed` then `waiting`, but without `--watch` nothing will ever restart it: no watcher is
   attached, `actions.restart` is never called from `createApp`, and the catalog has no
   `server.restart` entry. The only way out is Ctrl+C twice, which calls `stop()` with no
   child and exits 0, losing the crash code the wrappers were promised. Fix: give `Supervisor`
   a `canRestart` flag (true only when a watcher is attached) and treat a crash as `stopped`
   with the child's code when it is false; and add `server.restart` (Ctrl+Shift+R or the
   palette) so a TUI user can restart a crashed server under `--watch` without saving a file.
6. **design**, `packages/server/src/Server.ts:115-139` and
   `packages/console/src/startConsole.ts:142-146`. The host has no fatal path of its own. In
   plain mode an uncaught exception (an `EPIPE` on stdout under `| head` is enough) takes
   Node's default exit; in TUI mode `onUncaught` restores the terminal and calls
   `process.exit(1)`. Neither tells the supervisor, so the child is left to notice the IPC
   disconnect and run a full graceful shutdown with no SIGTERM or SIGKILL backstop; a child
   stuck in shutdown is an orphan. Fix: in `runHost`, register `uncaughtException` and
   `unhandledRejection` handlers that call `ui.close()` (best effort), then
   `supervisor.forceStop()` or `child.stop()`, then exit 1; let `startConsole` keep only the
   terminal restore and leave exiting to the host.
7. **nit**, `packages/server/src/host/Supervisor.ts:192-194`. A child killed by a signal with
   no stop requested (`code === null`, `forced === false`) exits the host with `code ?? 0`, so
   an OOM kill or SIGSEGV reads as success to a wrapper. Fix: `code ?? 1`, or `128 + signo`
   to match the shell convention.
8. **nit**, `packages/server/src/Server.ts:121-124`. `exit` awaits `ui.close()` before
   `process.exit(code)`; a rejected close (a failed history save is swallowed, but a renderer
   `destroy` throw is not) means the host never exits. Fix: `try { await ui.close() } finally
   { process.exit(code) }`.
9. **nit**, `packages/server/src/Server.ts:173` and `packages/server/src/cli/Cli.ts:48-55`.
   `--watch --headless` silently drops `--watch`. Fix: reject the combination in the `check`
   callback with a message, or run the host headless with the watcher and no frontend.
10. **nit**, `packages/server/src/Server.ts:130`. `packagesDir` is derived from
    `import.meta.url` with `../..`, which is `packages/` for both `src/Server.ts` and
    `dist/Server.es.js` in the monorepo but `node_modules/@jsprismarine/` for an installed
    package, where it watches nothing and `pnpm run generate` fails on every start. Fix: require
    `pnpm-workspace.yaml` next to `packagesDir` and print one line (`--watch needs the
    JSPrismarine repository`) otherwise.
11. **nit**, `packages/server/src/Server.ts:68` with `packages/logger/src/logger.ts:26,39`. The
    headless child still gets the default `PrismarineTransport`, which buffers its last 1000
    records for a console that never attaches. Harmless but pointless. Fix: a `Logger` option
    to omit the console transport, set when `headless`.

### Prismarine remote console (`packages/prismarine/src/console/`, `Server.ts` wiring)

12. **bug**, `packages/prismarine/src/console/RemoteConsole.ts:156-165` with
    `packages/prismarine/src/command/vanilla/StopCommand.ts:20` and
    `packages/console/src/startConsole.ts:229-232`. `StopCommand` awaits `server.shutdown()`,
    which ends in `process.exit`, so `dispatchCommand` never resolves and `command.result` is
    never sent. On the host the link closes first, `failPending('server link closed')` rejects
    the request, and `createApp.submit` shows a danger toast for a `stop` that worked. The
    same happens for any command that stops the server. Fix: in `RemoteConsole.runCommand`,
    answer `{ ok: true }` when the dispatch is still pending as `disable()` runs (track in
    flight ids and flush them in `disable`); or in `startConsole.onCommand`, treat a `server
    link closed` rejection as `{ ok: true }` while the supervisor state is `stopping`.
13. **design**, `packages/prismarine/src/console/RemoteConsole.ts:180-182` with
    `packages/prismarine/src/Server.ts:546-548`. `tickMs: 1000 / tps` restates TPS, so the
    `tick 50 ms` segment reads healthy at any load short of a dropped tick; the tick loop
    measures `elapsedMs` for every tick and throws it away. Fix: keep a short EMA of
    `elapsedMs` on the server and expose `getTickMs()`, then send that; until then drop
    `tickMs` from the status rather than send a derived number the status bar labels as a
    measurement.
14. **nit**, `packages/prismarine/src/console/RemoteConsole.ts:25-26`. The coalescing key uses
    `getTPS()` at two decimals, which on a live server moves every second (`19.98`, `20.02`),
    so the "only while something changed or every 5 s" rule degrades to 1 Hz always. Fix:
    round TPS to the nearest 0.5 (or integer) in `statusKey`.
15. **nit**, `packages/prismarine/src/console/RemoteConsole.ts:84-85`. `link.onClose` is
    subscribed in `enable()`, which runs after `childProcessLink`'s born-closed microtask
    unless the whole `runInProcess -> bootstrap -> enable` chain stays synchronous (it does
    today; one `await` added before `remoteConsole.enable()` in `Server.bootstrap` breaks it).
    Fix: subscribe in the constructor like `RemoteLogTransport` does.

### Console app (`packages/console/src/{app,help,startConsole.ts}`)

16. **bug**, `packages/console/src/startConsole.ts:68`. `TERMINAL_RESET` leaves the alternate
    screen and turns mouse and bracketed paste off, but OpenTUI's native `setupTerminal` also
    pushes kitty keyboard flags (`useKittyKeyboard` defaults to `{}`, which
    `buildKittyKeyboardFlags` turns into disambiguate and alternate keys). After a host crash
    the shell receives kitty-encoded keys until the user runs `reset`. Fix: append `\x1b[<u`
    (pop kitty flags), `\x1b[?1004l` (focus events), `\x1b[?2026l` (synchronized output), and
    `\x1b[0m`, and add a test that the sequence contains the kitty pop.
17. **design**, `packages/console/src/app/createApp.ts:362-382` with
    `packages/prismarine/src/command/CommandManager.ts:260`. `localCommand` claims every line
    beginning with `/` for search and namespace filters, but the server strips a leading `/`
    and the line console accepted `/stop`, `/list`, and `/say` the way Bedrock players type
    them. A user who types `/stop` now searches the log for "stop". Fix: route `/name ...` to
    the server when `name` is a known command (the completion list already has the names), or
    move the local commands to a prefix the server does not use (`:` or `/log`).
18. **design**, `packages/console/src/startConsole.ts:147-148`. Only `uncaughtException` gets
    the terminal-restore fallback. OpenTUI registers `unhandledRejection -> console.error`,
    and with `consoleMode: 'disabled'` that output goes nowhere, so a rejected promise in the
    host (there is no `--unhandled-rejections=strict` on the `dev` script) disappears without
    a toast or an exit. Fix: register the same handler for `unhandledRejection`, or route it
    through `report()` so it becomes a sticky toast.
19. **nit**, `packages/console/src/app/createApp.ts:396-409` and
    `packages/console/src/input/keys.ts:66-70`. The plan says a Ctrl+C while the server is
    `stopping` force kills; the decoder escalates by press count within a 2 s window and
    knows nothing of the state, so a user who waits more than 2 s after the stop needs three
    presses (hint, no-op stop, force). Fix: pass `serverStopping: state === 'stopping'` into
    `KeyState` and return `force` on the first press when it is set.

### Changesets and manifests

20. **nit**, `.changeset/hosts-watch-terminals.md:5` and `.changeset/new-console-packages.md:6`.
    Both say the TUI runs "on Node 26.4 or newer", but the gate is `await import('node:ffi')`,
    which 26.4 to 26.8 only pass with `--experimental-ffi`. Say "on a Node that loads
    `node:ffi` (26.9 and later, or 26.4 and later with `--experimental-ffi`)".
21. **nit**, `.changeset/new-console-packages.md`. Judge 2 asked for the exact `@opentui/core`
    pin to be recorded in a changeset note; add "pins `@opentui/core` 0.6.8 exactly".
22. **design**, `packages/server/package.json:84` with `packages/console/package.json`
    (`engines.node >=26.4.0`). `@jsprismarine/console` is a hard dependency of
    `@jsprismarine/server` (root engines `>=22.18.0`), so installing the server on Node 22
    pulls `@opentui/core` and its eight platform binaries and trips npm's engine warning for a
    package the plain path never imports. The changeset's "everywhere else ... unchanged" is
    not quite true of install. Fix: make it an `optionalDependencies` entry (the lazy import
    already tolerates its absence once `loadTuiFrontend` catches the import error), and say so
    in the changeset.

Bump levels check out against `docs/versioning.md`: server, console, console-protocol, and
logger are additive at 0.x and take `patch`; prismarine removes `writeAbovePrompt` and
`PromptWriter` and takes `minor`. The logger changeset names `LOG_LEVELS`, `isLogLevel`, and
`isAtLeastLevel`. The flags in `hosts-watch-terminals.md` (`--watch`, `--no-tui`,
`--headless`, `JSP_NO_TUI`) match `Cli.ts` and `tuiGate.ts`, and `Dockerfile:21` sets
`ENV JSP_NO_TUI=1`.

## Not findings, checked

- `startConsole.attach` detaches the previous generation's `onMessage` and `onClose` before
  subscribing the next, and `close()` detaches the last one; no listener leak per generation.
  The 10 s request timers are cleared on answer, on link close (`failPending`), and on close.
- Handler ordering: OpenTUI's `uncaughtException` handler only `console.error`s and does not
  exit, so `startConsole`'s handler, registered after it, runs and exits. Global `keyInput`
  listeners run before renderable handlers in OpenTUI's `emit`, so `createApp.onKey` resolves
  catalog bindings and `preventDefault`s before the `InputRenderable` inserts the character;
  `n`, `N`, Home, and End on an empty line work as bound.
- `forceStop` reaches `SIGKILL` through `child.kill()`; `handleSignals` maps the second signal
  to it; `stop` escalates `shutdown` message, SIGTERM at 1 s, SIGKILL at 11 s.
- Crash during `stopping` exits with the child's code; restart requested while spawning stops
  the fresh child and spawns again (correct for a file saved mid-spawn); SIGINT twice in plain
  mode is handled consistently by both processes (the child's second press exits 1, the host's
  second press kills).
- `loadEnvFiles` runs in both processes against the same `cwd` and the host passes its
  mutated `process.env` to the child; `JSP_DIR` resolves identically. `--watch` under `dist/`
  resolves `packagesDir` to `packages/`.
- Double output: the child writes no log lines to its own stdout (the logger has no console
  attached and nothing falls back to stdout); the only raw lines are `console.debug('Server
  stopped, Goodbye!')` and `console.error` from `Server.shutdown`, which surface as raw
  `supervisor.output` lines as judge 2 asked.
- `RemoteLogTransport` now subscribes to `link.onClose` (wave 1 finding 7 landed), and
  `childProcessLink` reports a born-closed channel (wave 1 finding 3 landed).
