# Console TUI wave 1 review

Reviewed the commits from `1990d875c3` to `806b499de5` that touch `packages/logger`,
`packages/console-protocol`, `packages/console/src/{theme,log,input,status,keymap}`, and
`packages/prismarine/src/{Console.ts,command/ConsoleSender.ts,Server.ts,console/RemoteLogTransport.ts}`.
`packages/server/src/host`, `packages/console/src/{help,app}`, and `RemoteConsole` were skipped as in
progress. Judged against `AGENTS.md`, the codebase-design and unslop skills, and `plan.md`.

## Checks run

| Check | Result |
| --- | --- |
| `pnpm exec biome lint <scope>` | 67 files, no diagnostics. Warns that `biome.json` declares schema 2.6.2 while the CLI is 2.6.3 (pre-existing, outside this change). |
| `pnpm exec prettier --check <scope>` | All files formatted. |
| `node scripts/check-unicode-escapes.mts` | Pass, 2299 files. |
| `node scripts/check-american-filenames.mts` | Pass. |
| `node scripts/check-jsdoc.mts` | Pass, no new exports without JSDoc. |
| `pnpm exec vitest run <scope>` | 26 files, 236 tests pass on Node 26.12.1. |
| `pnpm --filter console --filter console-protocol run typecheck` | Pass. |

Nothing in scope fails `pnpm run lint`. No `as` cast lacks a reason comment; the one cast
(`minecraftColors.ts:120`) is commented. No British spellings found in scope.

## Counts

Bug 3, design 7, nit 10, lint failure 0.

## Findings by slice owner

### Logger (owner of `packages/logger`)

1. **design**, `packages/logger/src/logger.ts:13`, `packages/logger/src/transport.ts:99`. The level
   order is a private `LEVEL_WEIGHT` constant written twice inside the logger, and consumers copy it
   again (`prismarine/src/console/RemoteLogTransport.ts:5`, `console/src/log/types.ts:8`, and the
   first six entries of `console/src/theme/theme.ts:10`). Five copies of one ordering violate the
   "derive values from their source of truth" rule, and `types.ts:5` says so in its own JSDoc. Fix:
   export one `LOG_LEVELS = ['error', ..., 'silly'] as const` from `@jsprismarine/logger`, derive
   `LogLevel` from it, replace both `LEVEL_WEIGHT` tables with `LOG_LEVELS.indexOf`, and add an
   `isLogLevel` guard. Then `types.ts` imports `LOG_LEVELS`, `theme.ts` builds
   `LEVEL_ROLES = [...LOG_LEVELS, 'dev']`, and `messages.ts` can validate `level` fields (finding 6).

### Protocol (owner of `packages/console-protocol`)

2. **nit**, `packages/console-protocol/src/messages.ts:113,132`. `level: 'string'` and
   `state: 'string'` accept any string, so `{ level: 'bogus' }` passes `isServerMessage` and then
   `compareLevels` in the console treats it as more severe than `error` (`indexOf` returns -1).
   Fix: once finding 1 lands, add an `enum` kind to the field table backed by `LOG_LEVELS` and the
   lifecycle state list, and add a rejecting test.
3. **nit**, `packages/console-protocol/src/childProcessLink.ts:56,82`. When `proc.send` exists but
   `proc.connected` is already false, the link is born closed and no `onClose` listener ever runs,
   so a server whose host disconnected during startup never learns to shut down. Fix: if
   `!proc.connected`, emit `close` on the next microtask after construction, or throw like the
   no-channel case.

### Line console and sender (owner of `prismarine/src/Console.ts`, `ConsoleSender.ts`, `Server.ts`)

4. **nit**, `packages/prismarine/src/Server.ts:223` and `packages/prismarine/src/Console.ts:66`.
   `logger.setConsole(this.console)` runs in `Server.enable`, then `Console.enable` calls
   `setConsole(this)` again. One is redundant. Fix: drop the call in `Console.enable` and let the
   server own the hookup (its comment already explains the ordering), or the reverse.
5. **nit**, `packages/prismarine/src/Console.ts:59,94`. `disable()` closes the readline but
   `enable()` returns early on the `enabled` flag, so a disable followed by enable never reads
   again. Nothing calls that sequence today (`Server.disable` does not disable the console), so
   this is latent. Fix: guard the chat subscription with `enabled` and the readline with
   `this.cli === undefined` separately.

### Remote log transport (owner of `prismarine/src/console/RemoteLogTransport.ts`)

6. **design**, `packages/prismarine/src/console/RemoteLogTransport.ts:5`. Third copy of
   `LEVEL_WEIGHT`; see finding 1. Fix: import the comparison from `@jsprismarine/logger`.
7. **nit**, `packages/prismarine/src/console/RemoteLogTransport.ts:144-168`. The transport never
   subscribes to `link.onClose`. After the link closes, every `send` returns `false`, so a full
   queue drains one record per `retryMs` tick for up to 100 seconds (5000 x 20 ms) on unref'd
   timers, doing nothing useful. Fix: in the constructor, `link.onClose(() => { this.closed = true;
   this.queue = []; this.stopRetry(); })`, and store the unsubscribe for `close()`.

### Theme (owner of `console/src/theme`)

8. **design**, `packages/console/src/theme/theme.ts:10,45`. Components do not consume `Theme`.
   `status/segments.ts:20` defines `StatusColors` as `Record<SegmentTone, string> & { text; background:
   string }` and `input/inputBar.ts:26-31` takes four `string` colors, while `Theme` values are
   `ColorInput` (`string | RGBA`) and `defaultTheme.text` and `.background` are `RGBA` instances.
   The app slice cannot pass `theme.text` to either component without a cast. Fix: define the
   plan's `ConsoleContext = { renderer, theme, ... }` once (for example `src/context.ts`), have
   `createStatusBar`, `createToastStack`, `createInputBar`, and `createLogView` take
   `Pick<ConsoleContext, 'renderer' | 'theme'>`, and delete `StatusColors` and the four color
   props. `SegmentTone` already matches `Theme` role names (`ok`, `warning`, `danger`, `muted`,
   `accent`), so `theme[segment.tone]` works as is. `logView.ts` already takes `theme` through
   props and is the model.
9. **nit**, `packages/console/src/theme/theme.ts:10` and `styled.ts:30`. The `dev` level role is
   defined but nothing renders it: `StoredRecord` has no supervisor kind, and `plan.md` says
   supervisor state renders as a status segment and toasts, never as log lines. Fix: drop `dev`
   from `LEVEL_ROLES` and `LEVEL_ATTRIBUTES`, or leave a one-line note that the host slice adds
   the record kind.

### Log store and view (owner of `console/src/log`)

10. **bug**, `packages/console/src/log/logWindow.ts:88-98`. `onReset` and `onResize` while paused
    clamp `first` but never recompute `following`. When a filter change shrinks the list so the
    whole thing fits, the window sits at the bottom with `following === false`, so later appends
    scroll out of view and the badge reads "N new lines, End to follow" while the user already is
    at the end. Fix: after clamping in both methods, set `this.following = this.first ===
    this.maxOffset` (the same rule `moveTo` applies), and add a `logWindow.test.ts` case.
11. **design**, `packages/console/src/log/types.ts:8`. Second copy of the level order; see
    finding 1.
12. **design**, `packages/console/src/log/logLine.ts:17,30-37,93-99`. `levelWidth: 'full' | 'short'`
    names a style, not a width, and `short` emits three-letter tokens where `ux-design.md` section
    1 (which `plan.md` says to follow) specifies one letter below 100 columns. Fix: rename to
    `levelStyle` in `LogLineOptions` and `LogViewProps`, and either switch to one letter or record
    the three-letter decision in `ux-design.md` so the two agree.
13. **nit**, `packages/console/src/log/logStore.ts:97` and `logLine.ts:73`. The text
    `${count} log lines were dropped` is built in both files. Fix: `logLine.ts` renders
    `record.message`, which `appendDropped` already fills.
14. **nit**, `packages/console/src/log/logLine.ts:5`. Value import from the `../theme` barrel
    (`theme/index.ts` is an `export *` file). The brief lists "no barrel value imports" as a rule;
    I did not find it written in `AGENTS.md`, so treat as the reviewer's convention. Fix: import
    from `../theme/styled` and `../theme/theme`, or make `theme/index.ts` export names explicitly.
15. **nit**, `packages/console/src/log/logLine.ts:101,153` versus `status/segments.ts:32`. The
    log line measures width in UTF-16 units (`.length`) while segments count code points
    (`[...text].length`). A message with an astral-plane character misaligns the ellipsis cut by
    one column. Fix: share one `columns()` helper (code points) between the two modules.
16. **nit**, `packages/console/src/log/logLine.ts:183`. `plainChunk('', theme, 'selection').fg`
    builds a throwaway chunk to get an `RGBA`. Fix: `parseColor(theme.selection)`.
17. **nit**, `packages/console/src/log/logStore.ts:76-81,242`. `matches` is invalidated on every
    push and recomputed by a full scan of the visible list on the next read. A status segment that
    shows the match count will scan up to 10 000 records per log line while a search is open.
    Fix: maintain the match list incrementally in `push` (append the new index when it matches,
    decrement all on a visible eviction) and only rebuild in `rebuild()`/`setSearch`.
18. **nit**, test gap, `packages/console/src/log/logView.test.ts`. No test that `dispose()`
    unsubscribes from the store and cancels the pending frame (append after dispose must not
    paint or throw). Add one; same for `statusBar.test.ts` and the `RESIZE` listener.

### Input bar, history, completion (owner of `console/src/input`)

19. **bug**, `packages/console/src/input/inputBar.ts:167-181,203-205`. Completion race: Tab
    captures `line` and `cursor`, the user types (`edit` action, which does not touch
    `completionRequest`), then the result arrives with `request === completionRequest` and
    `applyCompletion` overwrites the line with the stale prefix and suffix, discarding what was
    typed. The existing test only covers a newer Tab superseding an older one. Fix: in `handleKey`,
    bump `completionRequest` for every action other than `cycle` and `complete` (or compare
    `input.value === line && input.cursorOffset === cursor` before applying), and add a test that
    types between Tab and the resolved promise.
20. **bug**, `packages/console/src/input/keys.ts:47-53` versus `keymap/catalog.ts:49-67`. Two key
    maps bind the same empty-line keys. `keys.ts` decodes `?`, `w`, `g`, `G`, `/` into `toggle`
    actions; the catalog binds `?`, `w`, `/` too (as `view.help`, `log.toggleWrap`, `log.search`).
    When the app wires both `resolveCommand` and `onToggle`, one `w` press toggles wrap twice (a
    no-op) and `?` opens and closes help. Conversely `n`, `N`, `Home`, `End` exist only in the
    catalog, so the input bar types `n` into the line unless the app intercepts first, and `g`/`G`
    exist only in `keys.ts`, so the help overlay (generated from the catalog) never lists them even
    though `ux-design.md` section 6 does. Fix: make the catalog the single source. Add
    `empty('g')` and `empty('g', true)` to `log.top`/`log.bottom`, delete `TOGGLE_KEYS` and the
    `toggle` action from `keys.ts`, and have the app call `resolveCommand(key, { inputEmpty })`
    before the input bar's handler (with `preventDefault` on a hit). If the input bar must stay
    self-contained, derive `TOGGLE_KEYS` from `COMMAND_CATALOG` entries whose binding is
    `emptyLineOnly` with a single-character name.
21. **design**, `packages/console/src/input/inputBar.ts:26-31`. Four `string` color props; see
    finding 8.
22. **nit**, `packages/console/src/input/inputBar.ts:149`. The completion strip is laid out
    against `renderer.terminalWidth` once and not re-laid out on `RESIZE`. Fix: subscribe to
    `CliRenderEvents.RESIZE` like `statusBar.ts:99` does and remove it in `dispose`, or let the
    `TextRenderable` truncate.

### Status bar, segments, toasts (owner of `console/src/status`)

23. **design**, `packages/console/src/status/segments.ts:20-23`, `statusBar.ts:10-12`,
    `toasts.ts`. `StatusColors` and a private `StatusContext { renderer }`; see finding 8.
24. **nit**, `packages/console/src/status/toastQueue.ts:67-70`. When every existing toast is sticky
    and the queue is full, pushing a non-sticky toast evicts the toast just pushed and still returns
    its id, so the caller shows nothing. Fix: exclude the new toast from eviction (search
    `entries.slice(0, -1)`), falling back to the oldest sticky one.

### Scaffold (owner of `packages/console` root)

25. **nit**, `packages/console/src/opentui.test.ts`. A smoke test of the dependency, not of this
    package. It earned its keep during the spike; now that every component has a renderer test it
    only adds a second `createTestRenderer` boot. Fix: delete it, or keep it only if the Node 26
    FFI gate is what it is meant to prove and say so in the describe name.

## Not findings, checked

- Ring buffer arithmetic in `logStore.ts:190-216` (`start`, `count`, wrap, `hidden` bookkeeping
  on eviction) is correct and covered by `logStore.test.ts:188-222`.
- `LogWindow.onAppended` with `evicted` while paused is correct (`logWindow.test.ts:46`).
- `statusBar.dispose` removes the `RESIZE` listener; `toasts.dispose` clears the timer;
  `logView.dispose` unsubscribes and cancels the frame. `Renderable.remove(child)` and
  `requestAnimationFrame` exist on OpenTUI 0.6.8 with the signatures used.
- `childProcessLink.flush` resolves on disconnect (`pending = 0; settle()`), so the shutdown path in
  `Server.shutdown` cannot hang on a dead channel.
- `RemoteLogTransport.resume` cannot spin: each iteration consumes one queued record and a `false`
  send exits the loop before the next async resume.
- `Server.ts` at `HEAD` imports `./console/RemoteConsole`; the file looked untracked in the initial
  status snapshot but commit `96124d669b` added it while this review ran. Not a finding.
