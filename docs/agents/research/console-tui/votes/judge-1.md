# Judge 1: architecture and maintainability

Picks: `Q1=A Q2=2a Q3=3b Q4=4a Q5=5a`.

Lens: deep modules, seam placement, and what the repository will have to keep working for years.
I read the ballot and all four notes and spot-checked the repository and the local Node runtime
where that was cheap. Corrections to the research come first because two of them change the
implementation plan.

## Corrections to the research

- `--experimental-ffi` is not required on current Node. `ux-design.md` and `process-separation.md`
  quote the OpenTUI README, which says the flag is required. `opentui.md` cites
  nodejs/node#65475 (26.9.0 enabled `node:ffi` by default) and that is what the local probe shows:
  on Node 26.12.1 `import('node:ffi')` resolves with only an ExperimentalWarning, and both
  `--experimental-ffi` and `--no-experimental-ffi` are accepted flags. So the flag matters for
  26.4 through 26.8 only, and the host cannot add flags to itself anyway. Feature-detect
  `node:ffi` with a dynamic import in a try block instead of comparing version strings, and fall
  back to plain mode with a one-line hint when it fails. The SEA config still needs
  `execArgv: ["--experimental-ffi", "--no-warnings"]` because a SEA pins its own flags.
- The stdio shape differs between notes. `ux-design.md` section 4 proposes
  `['pipe', 'pipe', 'pipe', 'ipc']`; the ballot and `process-separation.md` say
  `['ignore', 'pipe', 'pipe', 'ipc']`. Use `ignore`. The child must never read stdin, and with
  `ignore` a readline fallback in the child sees EOF immediately and stays idle.
- `repo-map.md` is accurate on the four `getConsole()!` callers (`CommandManager.ts:309`,
  `Player.ts:324`, `Player.ts:844`, `ResourcePackClientResponseHandler.ts:267`). Those are
  `undefined` today in headless mode behind a non-null assertion. Any topology that makes the
  server headless by default in TTY mode turns this latent bug into a live one on the first
  op-channel broadcast.
- `color-parser` has no structured output. `Parser()` is a `replaceAll` from `§x` to ANSI open
  sequences (`packages/color-parser/src/Parser.ts`). `opentui.md` is right that core does not
  parse ANSI, so the TUI needs a `§`-to-`StyledText` mapper that nothing in the repository
  provides yet.
- `pnpm-workspace.yaml` has `onlyBuiltDependencies` with three entries. `@opentui/core` ships
  prebuilt binaries as optional platform packages and has no postinstall, so it does not need an
  entry. `.npmrc` sets `save-exact=true`, which already gives the exact pin `opentui.md` asks for.

## Question 1: topology and framework

Pick: Option A, host-first on plain `@opentui/core`.

Option A is the only one that meets the second criterion without caveats. With no TTY the entry
runs the server in-process and writes plain lines, which is byte-for-byte what the `Dockerfile`
(`CMD node --import tsx ./src/Server.ts`, PID 1, no TTY) does today. Option B makes every server,
including the one in the container, open a socket in `JSP_DIR` and carry a replay buffer and a
cleanup path for stale socket files, and it still needs a third process for the dev supervisor,
whose notices then have to be relayed through the server or a second socket. That is two new
moving parts in production to serve a dev-time feature. Option A also matches what the repository
already has: `dev.mts` is this host minus the TUI and minus the pipes, with `child`, debounce,
force kill, and signal forwarding written and tested by hand with `dev-smoke.exp`.

On framework, the renderable tree is already a component tree, and `@opentui/core/testing` runs on
Node. Option C puts a reconciler between our code and the renderer, adds `react`,
`react-reconciler`, and the unmarked peers `ws` and `react-devtools-core`, needs `jsx` and
`jsxImportSource` in `tsconfig.json`, `tsconfig.dts.json`, and the TypeDoc build, and OpenTUI has
no Node CI lane for React. `scripts/check-jsdoc.mts` scans only `.ts`, so `.tsx` components would
also slip past the documentation check. The reactivity argument in `ux-design.md` section 8 is
real but small: a store with `subscribe()` and a handful of derived getters covers `LogStore` and
the status segments.

Amendments to Option A:

- Add a server-side `CommandExecutor` (call it `ConsoleSender`) that is always constructed,
  independent of any attached UI, and replace the four `getConsole()!` callers with it. Both the
  IPC transport and the stdin fallback submit commands as that sender.
- Make the console sink in the server a real seam with two adapters from day one: the IPC
  transport and the plain stdout writer. The stdout writer is what headless mode uses, so both
  adapters ship in the first slice and the seam is not hypothetical.
- Load the TUI package with a dynamic `import()` only after the TTY and `node:ffi` checks pass,
  so Node 22 and 24 users and containers never evaluate OpenTUI code. Decide whether
  `@jsprismarine/server` lists the console package as a regular or optional dependency; the
  17.7 MB unpacked core plus platform binaries lands in every `npm install` of the bin otherwise.
- Use the argument form (`--role=server`) rather than an environment variable so `ps` shows which
  process is which.

## Question 2: where the protocol lives

Pick: 2a, a new `@jsprismarine/console-protocol` package.

Apply the deletion test. Remove the protocol module and the unions, codec, and adapter interface
reappear in both `@jsprismarine/prismarine` and the TUI package, so it earns its place. 2b fails
the dependency direction: `prismarine` would depend on a package whose `package.json` pulls
`@opentui/core` with `engines.node >=26.4` and eight platform-restricted optional dependencies
into the server's tree, which undoes the "server stays on Node 22" property that motivates the
split. 2c widens `@jsprismarine/logger` with commands, completion, status, lifecycle, chat, and
shutdown, none of which is logging, and logger is a leaf that `prismarine`, `server`, and `client`
all depend on. The new package costs the scaffolding `repo-map.md` section 3 lists (eleven files
plus a `references` entry), which `pnpm turbo gen Package` covers only partly. That is a one-time
cost; the wrong seam is a permanent one.

Amendments:

- The package depends on `@jsprismarine/logger` for `import type { LogLevel }` only, so the level
  list has one source of truth. No runtime dependencies.
- Ship the `Duplex`-like adapter interface with two adapters: the IPC adapter and an in-memory
  pair for tests. Do not write the NDJSON socket adapter until attach mode is scheduled.
- Drop `formatted` from the `log` message. With 3b the TUI builds `StyledText` from `level`,
  `namespace`, `at`, and `message`, and the headless stdout path formats locally, so `formatted`
  on the wire is dead weight that roughly doubles each record. The schema version covers this if
  it later proves wrong.
- Keep bodies JSON-only, as the ballot says, so the socket adapter is a framing change.

## Question 3: log pane rendering

Pick: 3b, ring buffer plus a windowed `LogView`.

The measurements in `opentui.md` section 4 decide this. 3a costs 6.6 ms per update at 5,000
`Text` children and 42 to 58 ms at 20,000, against a 10,000-record retention target in
`ux-design.md`, and every renderable, text buffer, and text view takes a native slot out of
65,536. A 10,000-line pane is within a factor of two of the cap issue #1611 hit. 3b measured 0.2
to 0.5 ms and keeps the native tree constant in size. The maintainability argument is stronger
than the performance one: filters, search, hidden-line counts, generation separators, and the
`older lines dropped` marker all need the records in JS anyway, so 3a stores every record twice,
once in the store and once in the renderable tree, and has to keep them in sync. `LogView` is a
deep module: `append`, `scroll`, `follow`, `setFilter`, `setSearch` on the outside, all the
rendering on the inside, testable through `createTestRenderer()` without a terminal.

Amendments:

- Start by rendering the window into one `TextRenderable` with `StyledText` chunks (the 0.19 ms
  row in the table). Move to a bounded pool of per-row renderables only if mouse selection or
  per-row hover needs it.
- Write the `§`-to-`StyledText` mapper next to the `toConsole` table in `color-parser` or derive
  it from that table, so the two color maps cannot drift.
- Reimplementing sticky scroll means owning `onMouseScroll`, `PgUp`/`PgDn`, `End`, and the
  new-lines badge. Cover follow-mode transitions with tests before adding filters.

## Question 4: the readline console

Pick: 4a, keep `Console.ts` as the fallback but reduce it to a plain line reader.

4b breaks the one contract every panel relies on: BDS-style plain lines on stdin. Pterodactyl,
Crafty, MCSManager, `docker attach -i`, and itzg's `send-command` all write commands to stdin, and
`process-separation.md` section 6 documents the same for Paper under panels. 4c keeps raw mode,
the `declare module 'node:readline'` augmentation of `_refreshLine`, and `writeAbovePrompt` in the
server process, which is the flicker and lost-input bug the whole project exists to remove, and it
keeps a second owner of raw mode alive beside the TUI. 4a turns the fallback into a shallow
adapter of the `ConsoleSender` seam: `readline.createInterface({ input: process.stdin, terminal:
false })`, one `line` listener that calls `dispatchCommand`, and a `write` that goes to stdout.
Ctrl+C then arrives as SIGINT, which `packages/server/src/Server.ts` already handles with a second
press forcing exit. Tab completion and the prompt redraw disappear from the fallback, which is
acceptable for a path whose interactive users are on Node below 26 or passed `--no-tui`.

Amendments:

- EOF or `close` on stdin must not stop the server. Containers without `-i` and the spawned child
  with `stdin: 'ignore'` both hit EOF at once.
- Delete `writeAbovePrompt`, `PromptWriter`, the readline module augmentation, and their tests.
  Keep `completeCommand` only if the TUI reuses it; otherwise it goes too.
- Regenerate `scripts/jsdoc-baseline.json` entries for the moved or removed `Console` members
  rather than carrying stale keys.

## Question 5: Ctrl+C

Pick: 5a, clear the line first, stop on a second press on an empty line.

In TUI mode Ctrl+C is a byte, not a signal, so the TUI defines the meaning either way; the
question is only which default. A server with players connected should not stop because someone
meant to clear a half-typed `tp` command. Claude Code and Gemini CLI use this exact rule, and
`stop` stays as the explicit command. The fallback path keeps today's single-press SIGINT
behavior, which is also what `docker stop` and panels expect, so the two modes differ only in
the one place where a human is holding the keyboard. This is the lowest-stakes question on the
ballot; I would not block on it.

Amendments:

- Give the second press a two-second window, show the hint in the status bar rather than a toast
  so it does not cover log lines, and let a press during `stopping` escalate to the existing
  10 s force-kill path.
- Set `exitOnCtrlC: false` and `exitSignals: []` on the renderer, as `opentui.md` section 3 says,
  so OpenTUI's default handlers do not destroy the renderer out from under the shutdown sequence.

## Top three risks for the implementation plan

1. The SEA path is unverified where it matters. It needs an ESM main (`mainFormat: "module"`,
   today the bundle is `format: 'cjs'` with `inlineDynamicImports`), asset extraction of the
   native library to disk before any core code runs, `'ipc'` stdio honored when the child is the
   SEA binary itself, and a Node 26 floor for packaging. OpenTUI runs this path in CI on Linux
   x64 only; `nightly.yml` builds on three OSes. Spike a throwaway SEA that spawns itself with
   `'ipc'` and draws one frame on all three OSes before writing any TUI code. If it fails, the
   fallback is to ship the TUI outside the SEA, and that decision changes the entry point.
2. Server-side lifecycle bugs that only show under load. The `ConsoleTransport` ring must be
   bounded with `log.dropped` (section 3 of `process-separation.md` shows 150 to 350 MiB of growth
   in the sender otherwise); the server must shut down on IPC `disconnect` or it orphans a process
   bound to 19132; the stdout fallback must be conditional on headless or every line prints twice;
   and `process.exit` must wait for the final `send` callback or the TUI never sees `stopped`.
   Each is a few lines and each is invisible in a quiet dev session. Write the tests for these
   with the in-memory adapter pair first.
3. OpenTUI is 0.x on an experimental Node module. Eight stable releases in sixteen days, a 0.6.0
   that removed custom-renderable APIs, `node:ffi` at Stability 1, open Windows issues (#1405 on
   conhost, #1726 on key decoding), and the dual-identity bundler issue #1534 that Vitest was not
   checked against. Mitigate by pinning exactly, keeping every `@opentui/core` import inside the
   TUI package behind `App` and `LogView`, running `@opentui/core/testing` tests in the existing
   Node 26 three-OS matrix, and treating Windows Terminal as the only supported Windows terminal
   for the first release.
