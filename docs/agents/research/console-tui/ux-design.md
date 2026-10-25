# Console TUI: UX and design research

Research notes for rebuilding the JSPrismarine console as an OpenTUI application in its own
process. Written 2026-10-25 against the sources listed inline. Statements marked *speculation*
are design proposals, not findings.

## Where we start

- `packages/prismarine/src/Console.ts` is a Node `readline` prompt (`> `). Ctrl+C calls
  `server.shutdown()` on the first press. Tab completion matches command names only (the
  argument case is a `TODO`). `writeAbovePrompt` erases the prompt row, prints the log line, and
  redraws the prompt, which is the root of the flicker and the lost-input problems.
- `packages/logger/src/logger.ts` formats `[HH:mm:ss LEVEL namespace]: message`. Level colors
  are the 16-color SGR codes: error 31, warn 33, info 32, verbose 36, debug 34, silly 35. The
  namespace is the caller's file name, or `path.ts:line:col` at `verbose` and below. Transports
  receive a `LogRecord` (`level`, `message`, `namespace`, `timestamp`, `formatted`), and
  `PrismarineTransport` buffers records until a console attaches. `FileTransport` strips ANSI
  and `§` codes. The six levels are documented in `docs/log-levels.md`.
- `packages/prismarine/src/chat/ConsoleText.ts` turns translation keys into English
  (`filfat joined the game`) and prefixes player chat with `<name>`.
- `packages/server/scripts/dev.mts` spawns the server with inherited stdio and prints
  `[dev]` lines: `change detected: <path>` (yellow), `restarting...` (green),
  `server exited with code N, waiting for changes...` (red), `graceful shutdown timed out,
  killing...` (red), `generating bedrock-data...` (cyan), `bedrock-data generation failed`
  (red), `watching <dir> for changes` (cyan). Debounce is 150 ms, force kill after 10 s.
- `Server.getTPS()` is a one second sliding window; `process.title` already carries TPS and
  tick (`packages/prismarine/src/Server.ts`).

Runtime constraint. `@opentui/core` runs on Bun 1.3.14+ or Node 26.4+ with ESM and
`--experimental-ffi` ([core README](https://github.com/anomalyco/opentui/blob/main/packages/core/README.md)).
The server runs under `node --import tsx` with `@types/node` 24. A separate TUI process is the
only way to adopt OpenTUI without moving the server's runtime, which fits the brief.

## 1. Layout

Pattern sources. lnav puts the view in the middle, status bars above and below, and the prompt
on the last line ([lnav UI docs](https://github.com/tstack/lnav/blob/master/docs/source/ui.rst)).
Pterodactyl renders the console as an xterm.js pane with a separate command input below it and
a details block (address, uptime or state, CPU, memory, disk, network, each with its limit and
a color by usage ratio) beside it
([Console.tsx](https://github.com/pterodactyl/panel/blob/1.0-develop/resources/scripts/components/server/console/Console.tsx),
[ServerDetailsBlock.tsx](https://github.com/pterodactyl/panel/blob/1.0-develop/resources/scripts/components/server/console/ServerDetailsBlock.tsx)).
Turborepo is a task list beside an output pane, with `h` hiding the list and a dim footer of
key hints that is replaced by context messages such as "Copied to clipboard!"
([developing-applications](https://turborepo.dev/docs/crafting-your-repository/developing-applications),
[pane.rs](https://github.com/vercel/turborepo/blob/main/crates/turborepo-ui/src/tui/pane.rs)).
lazygit switches to a portrait layout when the window is at most 84 columns wide
(`portraitModeAutoMaxWidth`) and keeps the side panel at a third of the width
([Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md)).
k9s lets users hide the header, logo, and crumbs (`headless`, `logoless`, `crumbsless`)
([k9s README](https://github.com/derailed/k9s/blob/master/README.md)).

### 120x40

```
 JSPrismarine 0.15.2 · default · 0.0.0.0:19132                                                 dev ● watching packages/ 
──────────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────
 12:00:01 INFO  Server       Starting JSPrismarine 0.15.2 (19 ┌──────────────────────────────┐│ Players 2/20            
 12:00:01 INFO  Server       Loading config.json              │ ● restarting (SIGTERM sent)  ││  filfat          12 ms  
 12:00:02 INFO  WorldManager Loading world default (overworld └──────────────────────────────┘│  Herobrine       48 ms  
 12:00:02 VERB  Chunk        Loaded 441 chunks in 318 ms                                      │                         
 12:00:03 INFO  RakNet       Listening on 0.0.0.0:19132                                       │ Worlds                  
 12:00:03 INFO  Server       Done in 2.14 s. Type help for commands                           │  default   441 chunks   
 12:03:40 INFO  Player       filfat joined the game                                           │            17 entities  
 12:03:41 DEBUG Network      ResourcePacksInfo sent to filfat (0 packs)                       │                         
 12:04:02 INFO  Chat         <filfat> hello                                                   │ Dev                     
 12:04:10 WARN  Network      Unhandled packet 0x9c from filfat                                │  watching packages/     
 12:04:11 INFO  Player       Herobrine joined the game                                        │  restarts 1             
 12:04:30 ERROR Command      Command "tp filfat ~ ~ ~" failed                                 │  last 12:05:33          
 12:04:30 ERROR Command      Error: Relative coordinates are not implemented                  │                         
 12:04:30 ERROR                  at TeleportCommand.run (prismarine/src/command/vanilla/Telepo│                         
 12:04:30 ERROR                  at CommandManager.dispatchCommand (prismarine/src/command/Com│                         
 12:05:00 INFO  Player       Herobrine left the game                                          │                         
 12:05:31 DEV   dev          change detected: packages/prismarine/src/Server.ts               │                         
 ─── 12:05:33 server restarted (generation 2) ─────────────────────────────────────────────── │                         
 12:05:33 INFO  Server       Starting JSPrismarine 0.15.2 (1990d875c3)                        │                         
 12:05:34 INFO  WorldManager Loading world default (overworld)                                │                         
 12:05:35 INFO  Server       Done in 1.98 s. Type help for commands                           │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
                                                                                              │                         
 ▼ 3 new lines · End to follow                                                                │                         
──────────────────────────────────────────────────────────────────────────────────────────────┴─────────────────────────
 > tp filfat 10 64 1                                                                                                    
   10 64 10 · 10 64 11 · 10 64 12                      Tab accept · Esc close                                           
 ● running · TPS 20.00 · 4.1 ms · 2/20 · 212/512 MB · up 00:05:40                                   info · all · ? help 
```

### 80x24

```
 JSPrismarine 0.15.2 · default                                   dev ● watching 
 12:00:03 I Listening on 0.0.0.0:19132                   ┌────────────────────┐ 
 12:00:03 I Done in 2.14 s. Type help for commands       │ ● restarting       │ 
 12:03:40 I filfat joined the game                       └────────────────────┘ 
 12:03:41 D ResourcePacksInfo sent to filfat (0 packs)                          
 12:04:02 I <filfat> hello                                                      
 12:04:10 W Unhandled packet 0x9c from filfat                                   
 12:04:11 I Herobrine joined the game                                           
 12:04:30 E Command "tp filfat ~ ~ ~" failed                                    
 12:04:30 E Error: Relative coordinates are not implemented                     
 12:04:30 E     at TeleportCommand.run (prismarine/src/command/vanilla/Teleport.
 12:04:30 E     at CommandManager.dispatchCommand (prismarine/src/command/Comman
 12:05:00 I Herobrine left the game                                             
 12:05:31 D change detected: packages/prismarine/src/Server.ts                  
 ─── 12:05:33 server restarted (generation 2) ───────────────────────────────── 
 12:05:33 I Starting JSPrismarine 0.15.2 (1990d875c3)                           
 12:05:34 I Loading world default (overworld)                                   
 12:05:35 I Done in 1.98 s. Type help for commands                              
                                                                                
                                                                                
                                                                                
 ▼ 3 new lines · End to follow                                                  
 > tp filfat 10 64 10                                                           
 ● 20.00 TPS · 2/20 · 212 MB · 00:05:40                                info · ? 
```

Essential: log pane, input line, status bar. Optional: title bar, side pane (players, worlds,
dev), completion row (appears only while completing), toasts. Degradation rules
(*speculation*, modeled on lazygit's portrait threshold and Turborepo's `h`):

- Below 100 columns, hide the side pane; `Ctrl+B` toggles it back as an overlay.
- Below 30 rows, drop the title bar and move its dev badge into the status bar.
- Below 60 columns, the status bar keeps only state, TPS, players, and `?`.
- Level names shrink to one letter and the namespace column disappears below 100 columns, as in
  the 80x24 mockup. The side pane never squeezes below 24 columns.

## 2. Log pane

Follow mode. lnav follows only while the view is at the bottom; scrolling up pauses and `G`
resumes ([discussion #1303](https://github.com/tstack/lnav/discussions/1303)). xterm.js, which
Pterodactyl uses, does the same, and Pterodactyl's `ScrollDownHelperAddon` shows an arrow
button on each new line while scrolled up and hides it once the viewport is back at the bottom
([XtermScrollDownHelperAddon.ts](https://github.com/pterodactyl/panel/blob/1.0-develop/resources/scripts/plugins/XtermScrollDownHelperAddon.ts);
[issue #2617](https://github.com/pterodactyl/panel/issues/2617) is the user request, and the
1.10.0 changelog turned the indicator into a down arrow). Grafana's live tail appends at the
bottom with a contrasting background and offers pause, resume, and stop
([Logs in Explore](https://grafana.com/docs/grafana/latest/visualizations/explore/logs-integration/)).
OpenTUI's `ScrollBox` implements this natively: `stickyScroll: true, stickyStart: "bottom"`
pins to the bottom, pauses when the user scrolls away, and resumes when they return
([ScrollBox docs](https://opentui.com/docs/components/scrollbox),
[ScrollBox.ts](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/ScrollBox.ts)).
Recommendation: use sticky scroll, count lines appended while unstuck, and render
`▼ N new lines · End to follow` over the pane's last row. `End` or `G` clears it.

Filtering. k9s filters with `/regex`, inverts with `/!regex`, and fuzzy-matches with `/-f`
([k9s README](https://github.com/derailed/k9s/blob/master/README.md)). Stern has
`--include`, `--exclude`, and `--highlight`, all regular expressions
([stern README](https://github.com/stern/stern/blob/master/README.md)). lnav keeps a Filters
panel listing enabled filters and the count of hidden lines, and `e`/`w` jump between errors
and warnings ([ui.rst](https://github.com/tstack/lnav/blob/master/docs/source/ui.rst),
[hotkeys.rst](https://github.com/tstack/lnav/blob/master/docs/source/hotkeys.rst)).
Recommendation: a minimum level (`info` by default, cycled with a key, shown in the status bar)
plus a namespace filter typed as `/ns:Network` or `/!ns:Chunk`, using the `namespace` field the
logger already emits. Show hidden-line counts next to the filter, as lnav does.

Search. lnav uses `/` for a PCRE prompt, `n`/`N` for hits, and marks hits on the scrollbar.
Pterodactyl binds Ctrl+F to the xterm search bar. Turborepo's `/` filters the task list and
`Esc` exits search ([input.rs](https://github.com/vercel/turborepo/blob/main/crates/turborepo-ui/src/tui/input.rs)).
Recommendation: `/` opens an incremental search in the input row, highlighting matches as the
user types; `Enter` locks the search, `n`/`N` step, `Esc` clears.

Plain mode. Codex binds Alt+R to a raw scrollback mode, and Claude Code's screen reader mode
leaves everything in scrollback (see section 7). OpenTUI offers `screenMode: "split-footer"`,
where captured stdout becomes scrollback above a footer whose height defaults to 12
([renderer docs](https://opentui.com/docs/core-concepts/renderer)). Recommendation: `Ctrl+P`
(plain) switches to split-footer so the terminal's native selection and search work, and the
`--no-tui` fallback prints plain lines. Mouse selection copies through OpenTUI's `selectable`
text and `copyToClipboardOSC52()` ([clipboard docs](https://opentui.com/docs/core-concepts/clipboard)).

Timestamps and columns. Paper prints `[HH:mm:ss LEVEL]: msg` and prefixes plugin loggers with
`[logger]` ([log4j2.xml](https://github.com/PaperMC/Paper/blob/main/paper-server/src/main/resources/log4j2.xml)).
BDS prints `[YYYY-MM-DD HH:MM:SS:mmm INFO] Player connected: name, xuid: ...` (captured in
[itzg/docker-minecraft-bedrock-server#143](https://github.com/itzg/docker-minecraft-bedrock-server/issues/143),
secondary). Factorio tags events as `[JOIN]`, `[CHAT]`, `[LEAVE]` (Factorio forum capture,
secondary). lnav aligns timestamps in a fixed left column and can hide the level field.
Recommendation: keep `HH:mm:ss`, fixed-width level and namespace columns so messages align,
toggle a date prefix only across midnight. Stern offers `--timestamps=short` for the same reason.

Coloring. Paper's `%highlightError` colors only errors red and warnings yellow and leaves info
plain ([TerminalConsoleAppender README](https://github.com/Minecrell/TerminalConsoleAppender)).
PocketMine colors the level tag: error dark red, warning yellow, notice aqua, info white,
debug gray ([MainLogger.php](https://github.com/pmmp/PocketMine-MP/blob/stable/src/utils/MainLogger.php)).
Grafana maps critical purple, error red, warning yellow, info green, debug blue, trace light
blue. Recommendation: color the level token and namespace, not the message; tint whole lines
only for `error`. This keeps `§` chat colors readable.

Wrapping. k9s defaults `textWrap: false`; Grafana offers wrap or horizontal scroll. OpenTUI
`Text` supports `wrapMode` `none`, `char`, `word`, and `truncate`
([TextBufferRenderable.ts](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/TextBufferRenderable.ts)).
Recommendation: truncate with a trailing `…` by default, `w` toggles word wrap with
continuation lines indented under the message column.

Retention. Turborepo keeps 2048 lines per task (`TURBO_TUI_SCROLLBACK_LENGTH`); k9s keeps
1000 (`logger.buffer`); MCSManager drops old entries when its buffer exceeds 64 strings and
inserts a warning (deepwiki summary, secondary). Recommendation: 10 000 records in a ring
buffer, configurable, with a `… older lines dropped` separator at the top when it overflows.

Lifecycle gaps. Pterodactyl writes `Server marked as <state>...` lines with a bold yellow
daemon prelude. Factorio logs state transitions. Recommendation: a full-width separator
`─── HH:mm:ss server restarted (generation N) ───` between generations, a dim `DEV` level for
supervisor notices, and history kept across restarts (section 4).

## 3. Input line

Prompt. Keep `> `; Pterodactyl uses a placeholder `Type a command...`. Show a placeholder
`type a command, ? for help` when empty.

History. Pterodactyl persists history per server in local storage, capped at 32, and walks it
with Up/Down. Claude Code stores history per working directory, collapses consecutive
duplicates, and lets Up recover a draft cleared with Ctrl+C
([interactive mode](https://code.claude.com/docs/en/interactive-mode)). Recommendation: persist
to `jsp/console-history` beside the config, cap at 500, dedupe consecutive entries, and keep
cleared drafts for the session.

Completion. Paper's console completes from the Brigadier tree through JLine candidates with
tooltips, and highlights the typed command live: literals default, each argument in a cycling
color (cyan, yellow, green, magenta, blue), unparsed tail red
([BrigadierCommandHighlighter.java](https://github.com/PaperMC/Paper/blob/main/paper-server/src/main/java/io/papermc/paper/console/BrigadierCommandHighlighter.java),
[BrigadierCommandCompleter.java](https://github.com/PaperMC/Paper/blob/main/paper-server/src/main/java/io/papermc/paper/console/BrigadierCommandCompleter.java)).
Claude Code shows ghost text for a single match with a `+2` count, and a list when several
match; Tab inserts. Recommendation: ghost text for one candidate, a one-row candidate strip
above the status bar for several (as in the mockup), a popup list only for more than eight.
The repository's `brigadier` package can drive argument suggestions and live highlighting, which
is the same model Paper uses.

Multi-line paste. OpenTUI delivers bracketed paste as a `paste` event, and `Input` strips
newlines ([keyboard docs](https://opentui.com/docs/core-concepts/keyboard),
[Input.ts](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Input.ts)).
Recommendation: split a pasted block on newlines and queue one command per line, showing
`queued 3 commands` as a toast.

Ctrl+C. Claude Code: interrupt if running, first press clears input, second exits. Gemini CLI:
`Ctrl+C` cancels or quits when input is empty, `Ctrl+D` exits on empty buffer
([keyboard shortcuts](https://geminicli.com/docs/reference/keyboard-shortcuts/)). k9s offers
`noExitOnCtrlC`. The current console shuts the server down on the first press. Recommendation:
with text, clear the line; with an empty line, show a toast `press Ctrl+C again to stop the
server` and stop on a second press within two seconds. `stop` remains the explicit command.
Set `exitOnCtrlC: false` and own the signal path, as the OpenTUI lifecycle docs advise when an
application handles both paths ([lifecycle](https://opentui.com/docs/core-concepts/lifecycle)).

Other keys. Codex `Ctrl+L` clears the screen without resetting state; Gemini `Ctrl+L` clears
and redraws. `Ctrl+R` opens reverse history search in Claude Code, Codex, and Gemini. Vite uses
`h + Enter` for a shortcut list, enabled only when stdin is a TTY and `CI` is unset
([shortcuts.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/shortcuts.ts)).
Palette: Helix opens a command palette with `Space ?`, opencode with `Ctrl+P`, and opencode
uses a leader key `Ctrl+X` with a 2 s timeout ([opencode TUI](https://opencode.ai/docs/tui/),
[keybinds](https://opencode.ai/docs/keybinds/)). Recommendation: `Ctrl+K` opens a palette that
lists server commands and TUI actions together, fuzzy-filtered as in fzf and Helix pickers.

## 4. Dev supervisor integration

Status segment. Zellij's status bar shows the current mode and its key hints; the compact bar
shows hints only as a tooltip ([Zellij 0.43 notes](https://zellij.dev/news/web-client-multiple-pane-actions/)).
tmux draws `status-left`/`status-right` and shows transient messages over the status line for
`display-time` ([tmux(1)](https://github.com/tmux/tmux/blob/master/tmux.1)). Turborepo titles
each pane `task > status`. Recommendation: a `dev` segment at the right of the title bar (or
status bar when narrow) with states `watching`, `change detected`, `generating bedrock-data`,
`restarting`, `crashed (exit N), waiting for changes`, `killed after timeout`. Color by state:
dim for watching, yellow for change and generating, green for restarting, red for crashed.

Toasts. lnav shows background task progress and completion messages between the view and the
status bars, then hides them after a short time. OpenTUI can also raise a desktop notification
with `renderer.triggerNotification()` (OSC 99, 777, or 9) and report progress to the terminal
with `setProgramStatus()` (OSC 7501)
([notifications](https://opentui.com/docs/core-concepts/notifications),
[program status](https://opentui.com/docs/application-apis/program-status)). Recommendation: a
toast stack at the top right of the log pane, 4 s default, errors sticky until dismissed; send a
desktop notification for a crash only when the terminal is unfocused.

History across restarts. Because the TUI owns the log store, the ring buffer survives the child
process. *Speculation*: the TUI process should spawn the server (replacing the inherit-stdio
spawn in `dev.mts`) with `stdio: ['pipe', 'pipe', 'pipe', 'ipc']` and receive `LogRecord`
objects over IPC rather than parsing formatted lines, since `LogTransport` already exists.
Commands travel the other way. Each new child increments a generation counter that labels the
separator.

## 5. Visual design

Palette. NO_COLOR: "when present and not an empty string (regardless of its value), prevents the
addition of ANSI color" ([no-color.org](https://no-color.org/)). btop uses truecolor, converts
to 256 when disabled (`--low-color`), and switches to 16-color TTY mode when it detects a real
tty ([btop README](https://github.com/aristocratos/btop/blob/main/README.md)). opencode's
`system` theme uses ANSI 0 to 15 and `none` for text and background so the terminal's own
palette shows through, and notes 256-color fallback without `COLORTERM`
([themes](https://opencode.ai/docs/themes/)). OpenTUI detects `rgb` and `ansi256` from `TERM`
and `COLORTERM`, and `RGBA.fromIndex(n)` and `RGBA.defaultForeground()` preserve palette
intent ([terminal capabilities](https://opentui.com/docs/reference/terminal-capabilities),
[colors](https://opentui.com/docs/core-concepts/colors)). Recommendation: define every color as
an ANSI index first, with an optional truecolor override, so 16-color terminals get the same
semantic palette. Honor `NO_COLOR` by rendering levels with attributes (bold for error,
dim for debug) instead of color.

Borders versus whitespace. lazygit colors only the focused border and defaults the rest to
`default`; its `border: rounded` is configurable. fzf defaults to rounded borders with labels in
the border line ([fzf man](https://github.com/junegunn/fzf/blob/master/man/man1/fzf.1)).
Turborepo uses dim footer text rather than extra borders. Recommendation: one vertical rule
between log and side pane, one horizontal rule above the input, no outer frame. Toasts and
popups get rounded borders because they float.

Avoiding clutter. k9s and lazygit let users hide every chrome element; Zellij moved hints into
an on-demand tooltip. Keep hints in `?` and the palette, not on screen.

Theme structure. lazygit names slots by role (`activeBorderColor`, `optionsTextColor`,
`selectedLineBgColor`); fzf names `fg`, `bg`, `hl`, `fg+`, `bg+`, `info`, `border`, `prompt`,
`pointer`; opencode themes have `defs` plus role keys with `dark`/`light` variants. Recommendation:
a `Theme` object keyed by role (`level.error`, `level.warn`, ..., `status.ok`, `status.warn`,
`status.danger`, `border`, `border.focused`, `muted`, `accent`, `selection`), each value
`{ ansi: number; rgb?: string }`, resolved once at startup against detected capabilities.

## 6. Keyboard shortcuts

| Key | Action | Pattern source |
| --- | --- | --- |
| `Enter` | Run command | all consoles |
| `Up`/`Down` | History (cursor first on multi-row input) | Claude Code |
| `Tab` | Accept completion / open list | Claude Code, Paper |
| `Ctrl+R` | Reverse history search | Claude Code, Codex, Gemini |
| `Ctrl+C` | Clear line; twice on empty line stops the server | Claude Code, Gemini |
| `Ctrl+L` | Clear visible log (buffer kept) | Codex, Vite `c` |
| `PgUp`/`PgDn`, `Ctrl+U`/`Ctrl+D` | Scroll log | lazygit, Turborepo `U`/`D` |
| `Home`/`End`, `g`/`G` (empty line) | Top / bottom and resume follow | lnav |
| `/` | Incremental search; `n`/`N` next/previous | lnav, Turborepo |
| `Ctrl+F` | Filter prompt (level, namespace) | k9s `/`, lnav filters |
| `Ctrl+E`/`Ctrl+W` | Next error / warning | lnav `e`/`w` |
| `w` (empty line) | Toggle wrap | k9s `textWrap` |
| `Ctrl+B` | Toggle side pane | Turborepo `h`, opencode `<leader>b` |
| `Ctrl+P` | Plain scrollback mode | Codex Alt+R |
| `Ctrl+K` | Command palette | opencode `Ctrl+P`, Helix |
| `?` (empty line) | Help overlay | lazygit, k9s, lnav, btop |
| `Esc` | Close overlay, cancel search | Turborepo, Helix |
| `Ctrl+Z` | Suspend | lazygit, opencode |

Help overlay. lazygit's `?` opens a keybindings menu; Turborepo's `m` toggles a popup listing
keybinds; btop has a help menu page. `@opentui/keymap/extras` ships `createBindingLookup` and
`formatCommandBindings` for cheat-sheet UIs, and the keymap supports layers, leader keys, and a
command catalog ([keymap README](https://github.com/anomalyco/opentui/blob/main/packages/keymap/README.md)).
Recommendation: generate the overlay from the keymap's command catalog so it never drifts from
the bindings, grouped as Input, Log, View, Server.

## 7. Accessibility and non-TTY behavior

The alternate screen has no scrollback, so screen readers can only read what is painted
([opencode #39368](https://github.com/anomalyco/opencode/issues/39368),
[codex #20489](https://github.com/openai/codex/issues/20489)). Claude Code's screen reader mode
prints flat labeled lines with no redraws, renders spinners as static text, turns menus into
numbered lists, rings the bell for attention, emits OSC 133 markers, and is enabled by flag,
environment variable, or setting in that precedence
([accessibility](https://code.claude.com/docs/en/accessibility)). TerminalConsoleAppender
disables JLine and ANSI when stdout is not an attached terminal, which is how Paper behaves
under web panels. PocketMine checks `stream_isatty(STDOUT)` and `TERM` before emitting colors
([Terminal.php](https://github.com/pmmp/PocketMine-MP/blob/stable/src/utils/Terminal.php)).
Vite enables shortcuts only when `stdin.isTTY && !CI`; Turborepo's `--json` forces stream mode.

Recommendation: three modes. `tui` (default when stdin and stdout are TTYs), `plain`
(`--no-tui`, `JSP_NO_TUI=1`, or non-TTY), and `screen-reader` (`--screen-reader` or
`JSP_SCREEN_READER=1`), the last being plain mode plus static status lines, labeled dev notices,
numbered confirmation prompts, and a bell on crash. Plain mode keeps today's line output and
readline so panels like Pterodactyl, Crafty, and MCSManager (which proxy stdin/stdout, with
MCSManager optionally allocating a PTY) keep working.

## 8. Component decomposition

Framework-agnostic names; each owns one piece of state. OpenTUI exposes the same renderables in
core, React, and Solid (`box`, `scrollbox`, `text`, `input`, `select`), plus `Portal` for
overlays and hooks `useKeyboard`, `usePaste`, `useTerminalDimensions`, `onResize`
([solid README](https://github.com/anomalyco/opentui/blob/main/packages/solid/README.md),
[react README](https://github.com/anomalyco/opentui/blob/main/packages/react/README.md)).

- `App`. Props: `connection` (IPC to server), `theme`, `mode`. Owns focus routing, layout
  breakpoints, and the keymap. Composes everything below.
- `LogStore` (not a view). Ring buffer of `LogRecord & { generation, seq }`, filters, search
  state, derived `visibleRecords`, `hiddenCount`, `unreadWhilePaused`. The single source for
  `LogView`, the status bar's filter segment, and the error/warning jump keys.
- `LogView`. Props: `records`, `follow`, `wrap`, `searchMatches`, `width`. Owns scroll
  position, maps to a `scrollbox` with `stickyScroll`. Renders `LogLine`s, `GenerationSeparator`s,
  and `NewLinesBadge`.
- `LogLine`. Props: `record`, `columns` (which to show), `highlight`, `wrap`. Pure. Renders
  timestamp, level token, namespace, message with `§` codes converted by `color-parser`.
- `GenerationSeparator`. Props: `generation`, `timestamp`, `reason`.
- `NewLinesBadge`. Props: `count`, `onFollow`. Visible only when `count > 0`.
- `InputBar`. Props: `history`, `completer`, `onSubmit`, `disabled` (server down). Owns the
  buffer, cursor, history index, draft stash, reverse-search state, and double Ctrl+C timer.
  Wraps `input`.
- `Completer`. Props: `candidates`, `selected`, `style: ghost | strip | list`. Pure. Candidate
  data comes from the server's command manager over IPC.
- `StatusBar`. Props: `segments: Segment[]`. Pure; truncates segments by priority on narrow
  widths.
- `Segment`. Props: `label`, `value`, `tone: ok | warn | danger | muted`, `priority`. Segments:
  `ServerState`, `Tps`, `TickTime`, `Players`, `Memory`, `Uptime`, `FilterSummary`, `DevState`.
- `SidePane`. Props: `players`, `worlds`, `dev`, `visible`. Owns nothing; sections are
  `PlayerList`, `WorldList`, `DevPanel`.
- `ToastStack`. Props: `toasts`. Owns timers and dismissal. `Toast` props: `tone`, `text`,
  `sticky`, `createdAt`.
- `HelpOverlay`. Props: `bindings` from the keymap catalog. Rendered through `Portal`.
- `CommandPalette`. Props: `items` (server commands plus TUI actions), `onRun`. Owns query and
  selection.
- `Theme`. Role-keyed palette (section 5), resolved once, passed through context.
- `SupervisorClient`. Spawns and restarts the server, emits `dev` state and `LogRecord`s,
  forwards commands. Framework-free.

Where React or Solid helps: `LogStore` derivations (`visibleRecords`, `hiddenCount`) and
status segments are reactive values that many components read; Solid signals or React context
plus memoized selectors remove manual invalidation. Solid's fine-grained updates suit a log pane
that appends many rows per second, and the OpenTUI README names OpenCode, a Solid app, as the
production user. The keymap package ships `KeymapProvider` for both frameworks.

## Sources not fully verified

Codex shortcut details come from third-party cheat sheets plus
[codex issue #2782](https://github.com/openai/codex/issues/2782); its Ctrl+C semantics changed
between versions. BDS, Factorio, Valheim, and ARK console formats come from issue trackers,
forums, and wikis rather than vendor documentation. Crafty and MCSManager console features come
from their README and marketing pages and a deepwiki summary. Next.js dev indicators were not
researched.
