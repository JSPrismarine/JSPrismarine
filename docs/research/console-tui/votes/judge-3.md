# Judge 3: developer and user experience

Lens: how `pnpm run dev` feels, how the TUI feels to an admin typing during lag, how a contributor
adds a panel or keybinding, whether components test without a terminal, and whether the result
reaches the bar set by the TUIs the research cites (lazygit, k9s, lnav, Turborepo, OpenCode).

Spot checks against the snapshot: `engines.node` is `>=22.18.0` and `.nvmrc` is `26.x`; no tsconfig
sets `jsx`; `scripts/package-sea.mts` emits CJS with `inlineDynamicImports`; `dev.mts` spawns with
`stdio: 'inherit'` and calls `setRawMode(false)` after each child exit; `Console.ts` calls
`server.shutdown()` on the first Ctrl+C; `getConsole()!` appears at four call sites; the
Dockerfile runs `node --import tsx ./src/Server.ts` as PID 1 on `node:26-slim`. The notes are
accurate where I could check them cheaply.

## Q1: A, host-first on plain `@opentui/core`

Option A is the only one where `pnpm run dev` gets better rather than more complicated. The host
already is `dev.mts` plus a renderer, so a crash shows the stack trace in the log pane with a
"waiting for changes" state instead of a dead terminal, and the ring buffer survives restarts so
the generation separator in the mockup is free. Option B turns dev into three processes and makes
`[dev]` notices travel through the server or a second socket before the admin sees them, which
is backwards for the most common contributor workflow. Option C adds React, a reconciler, two
unmarked peers, `jsx` settings in a repo that has none, `.tsx` files that `check-jsdoc.mts` does
not scan and `vite.config.ts` would pick up as entries, and a binding that OpenTUI's own docs say
has no Node CI lane. The renderable tree is already a component tree; `createTestRenderer()`
ran on Node 26 in the experiments and gives `captureCharFrame()` and `mockInput` without a TTY,
which is the testability bar I care about. OpenCode reaches production quality on OpenTUI with
Solid, so the quality ceiling is not the framework but the amount of UI logic we write ourselves.

## Q2: 2a, a separate `@jsprismarine/console-protocol` package

The server side of the transport must not pull OpenTUI into the server's dependency tree, and 2b
does exactly that (17.7 MB unpacked plus a native library) for a package that must still run on
Node 22 and bundle into the SEA. 2c puts command, completion, status, and lifecycle messages
beside `LogRecord` in a package whose job is logging, and future protocol bumps would ship as
logger releases. 2a costs the scaffolding that `repo-map.md` section 3 lists (roughly ten files
and a hand-added tsconfig reference), which is a one-time price. Keep it dependency-free so the
NDJSON adapter and a future non-Node client can use it.

## Q3: 3b, ring buffer with a windowed `LogView`

The UX note recommends `ScrollBox` sticky scroll and a 10 000 record retention in the same
section, and the OpenTUI note's measurements show those two choices do not fit together (6.6 ms
per update at 5 000 children, 42 to 58 ms at 20 000, 430 MB resident). Log storms are exactly
when an admin is typing, and a 40 ms update per line is the flicker and lost-input problem we
are leaving `readline` to fix. Multi-line stack traces also walk toward the 65 536 native object
cap in a long session. 3b costs us follow mode, the new-lines badge, wheel scrolling, and wrap
accounting in JS, but those are pure functions of (records, offset, height, width) that vitest
can test with no renderer at all, which makes them the easiest part of the TUI to maintain. The
visible-window approach measured at 0.2 to 0.5 ms per update.

## Q4: 4a, keep `Console.ts` as a plain line reader

Containers and panels (itzg's `send-command`, Pterodactyl, MCSManager) type commands into stdin,
and the process-separation note's Bedrock Dedicated Server comparison makes the same point, so 4b
removes a working feature for every headless user. 4c keeps raw mode and `writeAbovePrompt` in
the one path where they do the most harm (a redirected stdout gets `\x1b[2K\r` per line). A
non-raw `readline` with `terminal: false` loses the redraw code and its tests, and Ctrl+C becomes
a real SIGINT that `packages/server/src/Server.ts` already handles. This is also the base for the
screen-reader mode in `ux-design.md` section 7. The four `getConsole()!` call sites need a
server-side `CommandExecutor` regardless of this vote, so that split should happen first.

## Q5: 5a, two presses

Stopping a 20-player server by a reflexive Ctrl+C is the most expensive mistake an admin can make
at this prompt, and Claude Code, Gemini CLI, and k9s (`noExitOnCtrlC`) all moved away from a
single press. The first press clearing the line is also what people expect from a shell. The cost
is a changed habit for current users, which the status bar hint and a toast cover. `stop` stays
the explicit command. The plain fallback from Q4 keeps single-press SIGINT semantics, and that
mismatch is acceptable because the fallback has no status bar to show the hint in.

## Amendments to the winning options

- The host must spawn the child with `process.execArgv` (so `--import tsx` and
  `--unhandled-rejections=strict` carry over in dev) and `stdio: ['ignore', 'pipe', 'pipe', 'ipc']`
  as `process-separation.md` says, not the `['pipe', ...]` in `ux-design.md` section 4.
- Show a `starting` state the moment the host spawns, and when Node is below 26.4 print one line
  naming the version and the fallback before starting the server in-process. A silent fallback
  will read as "the TUI is broken".
- Components are factory functions `(ctx: { renderer, store, theme, keymap }) => Renderable`,
  one file each with a sibling `*.test.ts` on `createTestRenderer()`. The status bar takes
  `Segment` objects (`label`, `value`, `tone`, `priority`) so a new metric is a new object, not a
  layout change.
- Use `@opentui/keymap` (pinned to the same version as core) for bindings and generate the `?`
  overlay from its command catalog, so a new keybinding is one catalog entry and cannot drift
  from the help text. Verify its core runs on Node without the React or Solid adapters.
- `LogView` keeps its windowing (offset, follow, wrap, badge count) in a pure module with tests;
  the renderable layer only paints `StyledText` for the visible rows. Build `StyledText` from
  `level`, `namespace`, and `message`, not from `formatted`.
- Pin `@opentui/core` exactly and let Renovate open the bump PRs. Pass `consoleMode: "disabled"`,
  `exitOnCtrlC: false`, `exitSignals: []`, and restore the terminal from `uncaughtException` and
  `exit` in the host.
- Replace `dev-smoke.exp` with a vitest test that drives the host against a fake child over IPC
  and asserts frames with `captureCharFrame()`; keep the expect script only if a real PTY check
  is still wanted.

## Top three risks

1. Runtime floor and native FFI. OpenTUI needs Node 26.4+, `node:ffi` is Stability 1, and
   Windows has open issues (#1405 stdin handle on `conhost`, #1726 key decoding). Mitigate by
   gating the TUI on version and TTY with a visible fallback message, running the test-renderer
   suite on all three CI OSes, and pinning the version.
2. SEA path. The bundle must become ESM with `mainFormat: "module"`, extract the native library
   to disk, and spawn itself with an `'ipc'` stdio entry, none of which is verified for a SEA
   child. Spike this before the TUI depends on it, and ship the SEA with the plain fallback if
   the spike fails.
3. Dev loop regressions. Orphaned servers bound to 19132 when the host dies (needs the IPC
   `'disconnect'` shutdown), double output if the child also writes to stdout, a raw terminal
   left behind by a host crash, lost `.env` semantics, and `Progress.ts` writing control codes
   into the pipe. Each of these is a one-line check that the automated host test should cover.
