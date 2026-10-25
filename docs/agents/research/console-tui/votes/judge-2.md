# Judge 2: operations and distribution

Lens: admins running the server in Docker, systemd, Pterodactyl-style panels, and on Windows; the
single-executable build (`scripts/package-sea.mts`); the nightly matrix; crash, restart, and orphan
behavior; terminal state after a crash; and a log storm while the server loop is saturated.

Spot-checks against the repository at `1990d875c3`:

- `Dockerfile` runs Node as PID 1 with no TTY and stops on SIGTERM. `.nvmrc` is `26.x`, and
  `.github/common/install` reads it, so `test.yml` and `nightly.yml` already run on Node 26 on
  ubuntu, macos, and windows. `nightly.yml` has `continue-on-error: true` on the job and the build
  step, so a broken package step does not fail the run.
- `packages/server/src/Server.ts` handles `SIGSEGV`, `SIGHUP`, `SIGINT`, `SIGTERM`, and
  `uncaughtException`; a second signal calls `process.exit(1)`. `packages/prismarine/src/Server.ts`
  `shutdown()` calls `process.exit` right after `console.debug('Server stopped, Goodbye!')`, which
  discards any queued IPC writes. A `lifecycle: stopped` message sent from inside `shutdown()`
  will be lost unless the exit waits for the send callback.
- `packages/prismarine/src/Console.ts` returns from `enable()` when `process.stdin.setRawMode` is
  not a function. A server with piped stdin accepts no commands today. Panels that write `stop` to
  stdin get nothing; only SIGTERM works.
- `packages/server/scripts/dev.mts` spawns `node --import tsx ./src/Server.ts` with inherited
  stdio, swallows `SIGINT`/`SIGTERM`/`SIGHUP` so the child drives shutdown, SIGKILLs after 10 s,
  and calls `setRawMode(false)` after every child exit. A host that spawns `process.execPath` must
  forward `process.execArgv` or the `--import tsx` loader is lost in the dev flow.
- `packages/prismarine/src/utils/Progress.ts` keys interactive redraws on `process.stdout.isTTY`,
  so a piped child falls back to milestone logging on its own. `Server.ts:630` still writes to the
  real `console`, which lands in the child's piped stdout.

Where the notes conflict: `ux-design.md` proposes `stdio: ['pipe', 'pipe', 'pipe', 'ipc']` and a
sticky `ScrollBox` with 10 000 retained records; `process-separation.md` and `opentui.md` say
`stdin: 'ignore'` and a ring buffer with a windowed view. The measurements in `opentui.md` settle
the second conflict (see Q3), and `ignore` is right for the first: the child must never have a
readable stdin, or the fallback line reader in Q4 would attach to it.

## Q1: topology and framework

Pick: Option A.

Option B puts a listening socket in `JSP_DIR` into every deployment, including the container,
where `JSP_DIR=/data` is a bind mount with its own ownership and a stale socket file after a crash.
That is a new moving part in exactly the environment the second criterion protects, and it makes
the dev flow three processes. Option A changes nothing without a TTY: `docker logs`, SIGTERM to PID
1, and systemd keep the in-process path. It also fixes the orphan case for desktop users, because
the child shuts down on IPC `disconnect`, and it gives Windows a stop path (`shutdown` over IPC)
that does not depend on SIGTERM. Option C adds `react`, `react-reconciler`, and unmarked peers `ws`
and `react-devtools-core` to a repository with no JSX configuration, and OpenTUI has no Node CI
lane for React, so the SEA bundle would carry dependencies nobody upstream tests on Node. The one
thing B does better, a server that outlives a console crash, is a real loss under A (see risk 3),
but the stream adapter in A leaves attach mode open for later.

## Q2: protocol and transport location

Pick: 2a.

2b pulls `@opentui/core` (17.7 MB unpacked, plus a native library) into the server's dependency
tree, which means into the Docker image and the SEA bundle for a feature headless deployments never
run. 2c puts `command`, `status`, `chat`, and `lifecycle` unions into `@jsprismarine/logger`, a
published package whose public API is logging; every protocol version bump would then be a logger
release. 2a costs one package of scaffolding copied from `packages/logger` and a `references` entry
in `tsconfig.build.json`. It is also the only option under which a future `prismarine attach`
client, or a non-Node client over the NDJSON adapter, can depend on the protocol without depending
on either the TUI or the logger.

## Q3: log pane rendering

Pick: 3b.

A log storm is the case this whole design exists for, and 3a has a hard failure in it: one
native object per record against a 65 536 object table means a storm of 65 000 lines throws
`ObjectLimit` in the host, the host dies, the child sees `disconnect`, and the server shuts down
because of a UI data structure. Short of that, 3a measured 6 to 58 ms per update beyond 5 000
children and 430 MB resident at 20 000, while 3b measured 0.2 to 0.5 ms with the window drawn
into a bounded set of renderables. The 10 000 record retention `ux-design.md` asks for is only
reachable with 3b. The cost is owning scroll offset, follow mode, and the new-lines badge in JS,
which `ux-design.md` already specifies as `LogStore` and `LogView`.

## Q4: fate of the readline console

Pick: 4a.

Panels and `docker attach` speak plain stdin lines, which is how Bedrock Dedicated Server and the
itzg container work, so 4b (output only) would close the only interactive path those operators
have. 4c keeps raw-mode code in the server process, which is the behavior the project is trying to
remove, and keeps today's gap where piped stdin gets no commands at all. A plain line reader with
`terminal: false` serves both the Node < 26.4 TTY fallback and the piped panel case, and it is an
improvement for panels, not a regression. The reader must treat stdin EOF (systemd
`StandardInput=null`, `stdin: 'ignore'`) as "no console", not as a stop request, and it must not
start at all in the parented child.

## Q5: Ctrl+C

Pick: 5a.

In the TUI, Ctrl+C is a keypress, not a signal, so the host chooses the semantics. A single press
that stops a production server from inside a scrolling log pane is the kind of accident that costs
a world save, and the double press is what Claude Code and Gemini CLI do. The host must keep a
force path for a hung server: a press while the child is already `stopping` should skip straight
to `kill()`, which preserves the current "second Ctrl+C exits" behavior in `Server.ts` for the
case where it matters. `SIGTERM` and `SIGHUP` delivered to the host (tmux window closed, `kill`
from a script) must still stop the server on the first delivery with no double-press rule.

## Amendments to the winning options

- Gate the TUI on `stdin.isTTY && stdout.isTTY`, `TERM !== 'dumb'`, `CI` unset, and
  `JSP_NO_TUI` unset, not on stdout alone. Pterodactyl Wings creates containers with a TTY (my
  recollection of `environment/docker/container.go`; not verified from this repository), and
  `docker run -it` does too, so stdout alone would start the alternate screen inside a panel's
  xterm.js pane. Add `ENV JSP_NO_TUI=1` to the `Dockerfile`.
- Import `@opentui/core` lazily on the TUI path only. The headless path must never touch
  `node:ffi` or extract assets, so read-only root filesystems and Node 22 keep working unchanged.
- Decide the TUI floor by `await import('node:ffi')` in a try/catch, not by parsing the version.
  Node 26.4 to 26.8 need `--experimental-ffi`; 26.9 and later do not. Fall back to the line
  console when the import fails and say why in one line.
- Forward `process.execArgv` when spawning the child, and pass `role` as an argument rather than
  an environment variable so a nested `pnpm run dev` cannot leak it.
- The host derives `stopped` and `crashed` from the child's `exit` event (code and signal), not
  from a final IPC message, because `shutdown()` exits before queued sends drain. Keep a
  `lifecycle` message for `starting`, `running`, and `stopping` only.
- The host exits with the child's exit code once the child is gone, as `dev.mts` does today, so
  wrappers that watch the exit code keep working.
- On IPC `disconnect` the child runs the normal graceful `shutdown()` (players kicked, world
  saved), not `process.exit`.
- Replace the four `getConsole()!` call sites (`CommandManager.ts:309`, `Player.ts:324`,
  `Player.ts:844`, `ResourcePackClientResponseHandler.ts:267`) with a server-side console
  executor before enabling `headless: true` in the child; today they dereference `undefined`.
- Cap `PrismarineTransport`'s replay buffer and the new IPC ring in records and bytes, and
  surface `log.dropped` in the TUI as a visible notice, Wings-style, never as a silent gap.
- In `nightly.yml`, run the built binary (`--version`, then a headless boot that exits on
  SIGTERM) after packaging, and drop `continue-on-error` from the package step once the ESM SEA
  works. A silently failing nightly is how the SEA regression goes unnoticed.
- Pin `@opentui/core` exactly and record the version in a Changeset note; 0.x with eight releases
  in sixteen days is a renovate-driven breakage waiting to happen.

## Top three risks the plan must mitigate

1. The SEA conversion. OpenTUI needs an ESM main (`mainFormat: "module"`), asset extraction to a
   writable directory before the first import, and `execArgv` with `--experimental-ffi`; the
   current script emits CommonJS with `inlineDynamicImports` and a yargs patch written for CJS.
   Upstream tests this path on Linux x64 only, and whether `'ipc'` stdio works when the child is
   the SEA binary is unverified. Mitigation: run a spike that builds the ESM SEA on all three
   nightly runners and spawns itself with `'ipc'` before any TUI code is written, keep the NDJSON
   extra-fd adapter as the fallback carrier if `'ipc'` fails, and make the TUI an optional part of
   the SEA so a failed spike does not block the console work on `pnpm` installs.
2. A host failure takes the server down. Under Option A, a thrown error in a TUI handler, an
   `ObjectLimit` from the renderer, or a fault in `node:ffi` (Stability 1) ends the host, the
   child sees `disconnect`, and the server shuts down. Mitigation: wrap every renderer event
   handler so JS errors become a toast and never escape; use 3b so the object table cannot fill;
   make `disconnect` run the graceful shutdown with a world save; and install a host `exit` and
   `uncaughtException` fallback that writes the terminal reset sequence (leave alternate screen,
   disable mouse and bracketed paste, show cursor, raw mode off) so the shell is never left raw.
3. TTY misdetection and output mixing in panels. If the TUI starts inside a panel's PTY, the
   panel's line-based replay and throttling receive escape sequences and stdin commands go to a
   raw-mode input nobody can see. In the parented path, anything the child writes to its own
   stdout (`console.debug` in `shutdown()`, a stray `console.error`) must appear once in the TUI,
   not twice. Mitigation: the gate and `JSP_NO_TUI` amendment above, the stdout fallback made
   conditional on headless mode, and the child's piped stdout and stderr shown as raw lines with a
   distinct level so double output is visible in review rather than hidden.
