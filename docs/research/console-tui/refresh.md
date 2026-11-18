# Console TUI refresh: pain points and direction

Written 2026-11-19 against `master` at `c8aa6418935`. It reviews the console that
[ux-design.md](ux-design.md) planned and `packages/console` now implements, lists what gets in the
way, and proposes a direction that the mockups on the design canvas draw out. Frames quoted here
were rendered from the real `createApp` with OpenTUI's test renderer at 120x40 and 80x24, fed the
startup log of a dev server. Numbers in the mockups that the protocol does not carry yet are
samples.

## Pain points

Each item says what a user sees and where it comes from.

### Layout and information

1. **Every vital shows twice.** At 100 columns and wider, the status bar repeats TPS, players, tick
   time and memory from the side pane (`● running · ERR 1 · WARN 3 · TPS 20.00 · 1/20 · 6.1 ms ·
   212 MB`), so the footer is full and nothing in it is new.
2. **The footer's right half is unlabeled.** `INPUT · Esc log · info · all · 1 hidden × · ? help`
   holds the focus mode, two filter dropdowns named only by their value, and a hidden-line count.
   Nothing says that `info` is a minimum level or that `all` means every namespace.
3. **The title bar names the server and little else.** It shows the version and server name, but
   not the address and port a player joins on, the protocols, or the world. In steady state its
   right side reads `dev ● watching packages`, which never changes.
4. **The side pane is half empty and hard to read.** At 40 rows the lower half is blank. The TPS
   graph is a braille plot from 10 to 20; a healthy server is one row of dots along its top edge,
   so a dip of one tick is invisible. The Dev section spends three rows on `restarts 0` and
   `last —`.
5. **80x24 loses the server's identity.** Below 30 rows the title bar goes, and below 100 columns
   the side pane goes, so a small terminal shows no name, address or player list. The only hint
   is the word `details` in the footer.
6. **The namespace column cuts common names.** It is 12 columns wide, so `contentPayloads`
   becomes `contentPayl…`.

### State changes

7. **Three widgets report one restart.** A change shows a floating toast (`change detected:
   packages/prismarine/dist/Server.js [x]`), the dev badge switches to `starting`, and the log
   gets a separator. The toast covers the log text under it. In test-renderer frames, toasts
   pushed in the same frame painted over each other (`dchangeodetected:c…`); this needs checking
   in a real terminal.
8. **A restart wipes the side pane.** Players drop to `online 0` and the status bar loses every
   metric until the new server reports, with nothing to show progress through a boot that spends
   about 3.5 s loading the pack stack.
9. **A restart logs a misleading stop line.** The old server logs `Stopping server, interrupt again
   to exit immediately Server/kill.`: the TUI's restart has nothing to interrupt, and `Server/kill`
   is a legacy namespace argument the logger appends to the text
   ([#3266](https://github.com/JSPrismarine/JSPrismarine/issues/3266)).
10. **A crash leaves the user without a next step.** The badge reads `waiting for changes`, a sticky
   toast reads `server crashed (exit 1)`, and the trace arrives as raw `stderr` lines. The restart
   chord, Ctrl+Shift+R, needs the kitty keyboard protocol (`keymap/catalog.ts`), and nothing on
   screen offers it.

### Input and keys

11. **Focus mode decides what a key does, and the mode is a word in the footer.** Esc toggles
    between the input and the log. `w`, `t`, `g`, `n` and `?` act on the log only when it has
    focus or the input line is empty, so the same key types a letter or toggles wrap depending on
    state that is easy to miss.
12. **Completion gives values without meaning.** Tab shows a strip such as `[10]  ~` with no
    argument name, usage or description, though the `brigadier` dispatcher can produce usage text
    and the command registry carries descriptions (`Teleports entities.`).
13. **The command palette is bound but missing.** Ctrl+K and the help overlay advertise it; it
    answers `the command palette is not yet available`.
14. **Help is a flat list over the log.** It lists 20 commands in four groups with no sign of
    which ones apply in the current focus.

### Reading the log

15. **Stack traces are long and lose their shape when wrapped.** A wrapped frame's tail hangs at
    the message column rather than under `at`, and a four-frame trace takes six rows with no way
    to fold it.
16. **The palette predates the brand.** The console uses teal `#70bdb3` and orange `#d9955c` on
    `#171d20`; the brand uses accent `#5ca48a`, signal `#ff6b3d` and ink `#0b1713`, and the docs
    site's terminal (`--jsp-term-*` in `brand.css`) already derives its text, bar and muted shades
    from those tokens.

## Nice to have

- **Command palette.** Server commands with their registry descriptions, console actions with
  their keys, and online players, in one fuzzy list on Ctrl+K.
- **Usage while typing.** The current command's usage above the prompt with the argument under
  the cursor marked, Paper-style argument coloring, and a parse error before Enter.
- **One activity line.** A fixed row above the prompt for supervisor events (change, generate,
  restart, crash), replacing dev toasts. Toasts stay for answers to the user's own actions, such
  as `Copied 3 lines`.
- **A boot timeline.** While the server starts, the side pane lists the boot phases the log already
  reports (protocols, pack stack, loot tables, join payloads, world, listening) with their times.
- **A crash card.** Exit code, the error, the first frame in the repository's source, and keys to
  restart, open the frame in the editor (the console already opens source locations) and copy the
  trace.
- **Folded stack traces.** The first frame shows and the rest fold behind `▸ N more frames`.
- **A players list worth keeping open.** Join times now; ping, dimension and game mode once
  `console-protocol` carries them, with kick, op and teleport through the palette.
- **Remembered preferences.** Wrap, side pane width and the level filter persist across runs
  beside the command history.
- **Quick filters.** One key each for chat, joins and warnings, shown as chips in the footer.

## Direction

The mockups follow these rules.

- **One place per signal.** Server state lives in one solid tile at the top left: accent when
  running, warning while starting or restarting, signal when crashed, and inverse text without
  color. Vitals sit beside it in the header. The side pane holds lists and history, not repeated
  numbers. The footer holds keys.
- **The footer says what keys do now.** It lists the bindings that apply to the focused region,
  so the focus mode shows through what you can press rather than through a label.
- **The log is the product.** It keeps the full height, aligned columns and a gutter mark for
  warnings and errors. Chrome stays on the deep surface and never covers log text, except for
  overlays the user opens.
- **Brand tokens, terminal-tuned.** Ink background, deep panels, the docs terminal's derived text,
  bar and muted shades, accent for healthy state, and signal only for the prompt, the cursor, focus
  and errors. The brand has no warning color; the mockups keep the console's amber `#e0b570` for
  it, which needs a decision. The 16-color and `NO_COLOR` themes need matching values for every
  new role.

## Mockups

The [design canvas](https://claude.ai/artifact/9p8piuJLXCDsXgLWK3euDW) has one artboard per state.
Each has a palette switch between the brand direction and today's colors.

| Artboard  | Size   | Shows                                                         | Addresses            |
| --------- | ------ | ------------------------------------------------------------- | -------------------- |
| Today     | 120x40 | The current console, from a rendered frame                    | Baseline             |
| Running   | 120x40 | State tile, header vitals, side pane, key footer               | 1, 2, 3, 4, 6, 11 |
| Starting  | 120x40 | Boot timeline in the side pane, activity line                 | 7, 8, 9              |
| Command   | 120x40 | Usage above the prompt, argument coloring, candidates         | 12                   |
| Crashed   | 120x40 | Crash card with restart, open and copy keys, folded trace     | 10, 15               |
| Palette   | 120x40 | Ctrl+K over the log                                           | 13, 14               |
| Compact   | 80x24  | Header row kept, side pane as a key away                      | 5                    |
