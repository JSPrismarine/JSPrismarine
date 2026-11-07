# OpenTUI as a base for the server console

Research notes, 2026-10-25. Sources are the `anomalyco/opentui` repository at commit
`82f27220c8439fee9821aba43af9590db807c1b4` (main, 2026-10-25), the npm registry, the Node.js
repository, and the `anomalyco/opencode` repository. Repository paths below are relative to the
OpenTUI repository unless they start with `packages/prismarine`. Claims from local experiments
name the script that produced them; those scripts lived in a scratch directory and are not in this
repository. Anything marked unverified was not checked against a primary source.

## 1. Packages, versions, license, cadence

| Package | Latest | Published | Notes |
| --- | --- | --- | --- |
| `@opentui/core` | 0.6.8 | 2026-10-23 | Zig native core plus TypeScript bindings. Unpacked size 17.7 MB, of which 4.6 MB is `assets/` (Tree-sitter grammars and WASM). |
| `@opentui/react` | 0.6.8 | 2026-10-23 | Depends on `react-reconciler ^0.33`. Peers `react >=19.2.0`, `ws ^8.18`, `react-devtools-core ^7`, none marked optional. 91 KB unpacked. |
| `@opentui/solid` | 0.6.8 | 2026-10-23 | Peer `solid-js` 1.9.12 exactly. Runtime dependencies include `@babel/core`, `babel-preset-solid`, `@babel/preset-typescript`, `babel-plugin-module-resolver`. 339 KB unpacked before those dependencies. |
| `@opentui/keymap` | 0.6.8 | 2026-10-23 | Key binding layers and command routing. Optional React and Solid adapters. |
| `@opentui/ssh` | 0.6.8 | 2026-10-23 | Serves a renderer over `ssh2`. |
| `@opentui/qrcode`, `@opentui/three` | 0.6.8 | 2026-10-23 | Not relevant here. `three` is Bun-only. |
| `@opentui/core-{darwin,linux,win32}-{x64,arm64}` and `-linux-*-musl` | 0.6.8 | 2026-10-23 | Prebuilt native library, one package per target, `os`/`cpu` restricted. `core-darwin-arm64` is 4.4 MB and contains `libopentui.dylib` plus an `index.js` that exports its path. |

Sources: npm registry documents for each package (`https://registry.npmjs.org/@opentui/<name>`), and
the extracted `@opentui/core-0.6.8.tgz` and `@opentui/core-darwin-arm64-0.6.8.tgz`.

License is MIT for every package (`LICENSE`, each `package.json`, and the GitHub API
`license.spdx_id`). The native package also ships `LICENSE-GHOSTTY`, `LICENSE-LIBWEBP`,
`LICENSE-STB`, and `LICENSE-WUFFS` for vendored code.

Cadence and stability signals:

- 349 versions of `@opentui/core` since 0.1.0 on 2025-08-13, including nightly
  `0.0.0-<date>-<sha>` snapshots under the `snapshot` dist-tag. Eight stable releases shipped
  between 2026-10-07 (0.5.15) and 2026-10-23 (0.6.8). Source: the registry `time` map.
- 0.6.0 (2026-10-10) moved layout, hit testing, and painting into the native scene and removed
  `Renderable.render()`, `getLayoutNode()`, and other custom-renderable APIs. Built-in renderables
  and the React and Solid bindings kept their option names.
  `packages/web/src/content/docs/releases/0.6.0.md`.
- The repository has 13,619 stars, 793 forks, 190 open issues, and was created 2025-07-21 (GitHub
  API `repos/anomalyco/opentui`). The README says OpenCode uses it in production.
- The 0.x version line and the experimental Node FFI backend (section 2) mean breaking changes
  between minors should be expected.

## 2. Runtime requirements

### Bun or Node

`@opentui/core` runs on Bun 1.3.14+ and on Node.js 26.4.0+. Both are declared in `engines`
(`packages/core/package.json`, also in the published manifest). The published package has two
builds selected through the `exports` conditions: `index.bun.js` for the `bun` condition and
`index.node.js` for `node` and `import` (published `package.json`, `exports["."]`).

The FFI layer is `packages/core/src/platform/ffi.ts`. It checks `process.versions.bun`; on Bun it
`require`s `bun:ffi`, otherwise it `require`s `node:ffi` and falls back to a placeholder backend
whose first native call throws `FFI_UNAVAILABLE` (`loadBackend()`, lines 207-220). There is no
N-API addon and no third-party FFI package in the shipped path. The repository's `AGENTS.md`
section "Portable FFI" requires every native signature to stay inside the `bun:ffi` and
`node:ffi` intersection.

History: issue #2 (2025-07-29) asked for Node support. PR #939 (2026-04) prototyped it on
`koffi`; PR #991 (2026-04-29) added the `node:ffi` backend; PR #1046 and #1149 (2026-05/06)
landed Node 26 support; PR #1410 (2026-08-23) set the 26.4.0 minimum. Issue #2 was closed
2026-06-08. URLs: `https://github.com/anomalyco/opentui/issues/2`, `/pull/939`, `/pull/991`,
`/pull/1046`, `/pull/1149`, `/pull/1410`.

Node-side constraints from `packages/web/src/content/docs/getting-started/runtime-support.mdx`:

- ESM only. `require("@opentui/core")` fails with `ERR_REQUIRE_ASYNC_MODULE` because the root
  module graph is asynchronous.
- The docs say to start Node with `--experimental-ffi`. `node:ffi` was added in Node 26.1.0 as
  Stability 1 (Experimental) (`doc/api/ffi.md` in `nodejs/node`), and Node 26.9.0 enabled it by
  default (`CHANGELOG_V26.md`, "ffi: enable module by default", PR nodejs/node#65475). On the local
  Node 26.12.1, `import("node:ffi")` succeeds without the flag and prints an ExperimentalWarning.
  `NODE_OPTIONS=--experimental-ffi` is also accepted.
- Node 26 enters LTS on 2026-10-28 (`nodejs/Release` `schedule.json`). Node 22 and 24 never get
  `node:ffi`, so OpenTUI cannot run on them.
- Under `--permission`, native calls need `--allow-ffi` plus read access to the native library.
- Node CI lanes: Core source tests on macOS arm64, Linux x64, Windows x64; packed and SEA tests on
  Linux x64 only; Solid has a Node lane, React has none.

Known Node-specific bugs: `-0` arguments threw `TypeError` in many calls until PR #1709
(2026-10-20).

### Prebuilt binaries

Eight targets: macOS x64 and arm64, Linux glibc x64 and arm64, Linux musl x64 and arm64, Windows
x64 and arm64 (`optionalDependencies` in `packages/core/package.json`; table in
`runtime-support.mdx`). Linux selects musl with `OPENTUI_LIBC=musl` set before the first import.
Alpine may need `libstdc++` and `libgcc`. FreeBSD support exists as an experimental PR (#1676).
The docs say an available artifact does not prove parity on every target.

### Bundling with rolldown or vite

The Node build resolves its native library by dynamically importing the platform package by name
(`await import(specifier)` in `packages/core/src/platform/runtime-assets.node.ts`,
`resolveNativeLibraryPath()`), or by reading `OTUI_ASSET_ROOT` when set. It also uses
`createRequire(import.meta.url)` for `node:ffi` and `import.meta.url` for asset paths.

Local experiment with this repository's rolldown (`bundle.mjs`, `platform: "node"`, ESM output):

- With `@opentui/*` marked external, the 408-byte bundle ran under Node 26.12.1 and rendered a
  frame through the test renderer.
- With everything inlined (1.45 MB bundle), the bundle still ran, but only when
  `@opentui/core-darwin-arm64` was resolvable from the bundle's directory or when
  `OTUI_ASSET_ROOT` pointed at an extracted asset directory. Without either it threw
  `Failed to initialize OpenTUI render library: Cannot find package '@opentui/core-darwin-arm64'`.

Issue #1534 (open) reports a dual-module-identity problem when a bundler or test runner resolves
both the `bun` and `node` conditions at once; `Renderable.remove()` uses `instanceof`
(`https://github.com/anomalyco/opentui/issues/1534`). Vitest was not tried; unverified.

### Node SEA

Supported and documented in
`packages/web/src/content/docs/reference/standalone-executables.mdx` ("Node.js SEA") and
`ship/deploy.mdx`. The procedure: bundle as one Node ESM file, call `getNodeAssets()` from
`@opentui/core/node-assets` at build time, embed each `{ key, source }` in the SEA `assets` map,
prepend startup code that extracts every asset with `node:sea` `getRawAsset()` into an absolute
directory, set `OTUI_ASSET_ROOT` to that directory before any Core code runs, and build with
`mainFormat: "module"`, `useSnapshot: false`, `useCodeCache: false`,
`execArgv: ["--experimental-ffi", "--no-warnings"]`, `execArgvExtension: "none"`. The repository
runs this acceptance path on Linux x64 only.

The manifest for darwin-arm64 has 16 entries and 12 MB: the dylib plus Tree-sitter grammars,
queries, worker, and WASM (`manifest.mjs` experiment). `runtime-support.mdx` says a configured root
must contain the assets "for every feature that the application uses", so a console that never
mounts `Code` or `Markdown` needs only the native library. Not tested here; unverified.

Differences from `scripts/package-sea.mts` in this repository: the current script emits CommonJS
(`format: 'cjs'`) with `inlineDynamicImports`, and does not set `mainFormat`, `execArgv`, or
`assets`. OpenTUI requires ESM and asset extraction.

## 3. Core API without a framework

Renderer creation, from `packages/web/src/content/docs/getting-started/quickstart.mdx`:

```ts
import { BoxRenderable, TextRenderable, createCliRenderer } from "@opentui/core"

const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: "#1131E9" })

const counter = new TextRenderable(renderer, { id: "counter", content: "Count  0", fg: "#FFFFFF" })
const panel = new BoxRenderable(renderer, { width: 42, height: 9, alignItems: "center", justifyContent: "center" })
panel.add(counter)
renderer.root.add(panel)

renderer.keyInput.on("keypress", (key) => {
  if (key.name === "q") renderer.destroy()
})
```

Renderables (`packages/core/src/renderables/`, `components/overview.mdx`): `Box`, `Text`,
`ScrollBox`, `ScrollBar`, `Input`, `Textarea`, `Select`, `TabSelect`, `Slider`, `Code`,
`Markdown`, `Diff`, `TextTable`, `LineNumber`, `ASCIIFont`, `FrameBuffer`, `Image`,
`EmbeddedTerminal`, `TimeToFirstDraw`. All take `(renderer, options)` and compose through
`add()`. Custom renderables draw in `renderSelf()`, `renderBefore`, or `renderAfter` and report
size with `setMeasureProvider()` (`releases/0.6.0.md`, `extend/custom-renderables.mdx`).

Layout is Yoga flexbox with a fixed option set: `position`, edges, `width`/`height` (number,
`"auto"`, percent), min/max, margin, padding, `flexGrow`, `flexShrink`, `flexBasis`,
`flexDirection`, `flexWrap`, `alignItems`, `alignSelf`, `justifyContent`, gap. Sizes are
terminal columns and rows (`core-concepts/layout.mdx`). Absolute positioning is the documented way
to build overlays; `zIndex` orders sibling paint and hit testing (`layout.mdx` line 166,
`renderables.mdx` line 180).

Styling: `fg`, `bg`, `backgroundColor`, `attributes` bit mask (`TextAttributes.BOLD | UNDERLINE`),
and the `t` template tag with `bold`, `italic`, `underline`, `dim`, `fg("#hex")`, `bg(...)`,
`link(url)` helpers that produce `StyledText` chunks (`core-concepts/text-and-cells.mdx`,
`components/text.mdx`). Boxes take `border`, `borderStyle` (`single`, `double`, `rounded`,
`heavy`), `title`, `titleAlignment` (`components/box.mdx`).

Focus: one focused renderable per renderer. `Input`, `Textarea`, `Select`, `TabSelect`,
`ScrollBox`, `ScrollBar` are focusable by default; `focus()` and `blur()` are explicit. There is no
automatic Tab traversal (`core-concepts/interaction.mdx`, "Renderable focus"). Left click focuses
the nearest focusable target unless `autoFocus: false`.

Keyboard: `renderer.keyInput.on("keypress" | "keyrelease" | "paste", ...)`. `KeyEvent` has
`name`, `sequence`, `raw`, `ctrl`, `shift`, `meta`, `option`, `eventType`, and Kitty extras.
Global listeners run before the focused renderable; `stopPropagation()` and `preventDefault()`
control delivery. Components accept `keyBindings` arrays such as
`[{ name: "s", ctrl: true, action: "submit" }]` (`core-concepts/keyboard.mdx`).

Mouse: on by default (`useMouse: false` to disable). Renderable options accept `onMouseDown`,
`onMouseUp`, `onMouseMove`, `onMouseDrag`, `onMouseScroll`, `onMouseOver`, `onMouseOut`; events
bubble through `parent` (`interaction.mdx`). Text selection with drag is on by default.

Resize: the renderer emits `resize(width, height)` and listens for `SIGWINCH` only when it uses
`process.stdout`; custom streams call `renderer.requestResize()` (`core-concepts/renderer.mdx`).

Screen mode: `screenMode` is `"alternate-screen"` (default), `"main-screen"`, or
`"split-footer"` (a footer region with captured stdout scrolling above it).
`OTUI_USE_ALTERNATE_SCREEN` overrides it (`renderer.mdx`, `reference/env-vars.mdx`).

Rendering is demand-driven by default; property setters call `requestRender()`. `start()` turns on
continuous rendering at `targetFps` (`renderer.mdx`).

Exit: `renderer.destroy()` is synchronous and idempotent; terminal restoration and output flushing
finish later, so `await renderer.closed` before exiting or reusing streams. By default the renderer
installs handlers for `SIGINT`, `SIGTERM`, `SIGQUIT`, `SIGABRT`, `SIGHUP`, `SIGBREAK`, `SIGPIPE`,
`SIGBUS` that call `destroy()`; pass `exitSignals: []` and `exitOnCtrlC: false` to own shutdown.
The native shutdown sequence leaves the alternate screen, disables mouse, paste, focus, and
keyboard modes, shows the cursor, and only then sets raw mode off (`core-concepts/lifecycle.mdx`).

```ts
const renderer = await createCliRenderer({ exitOnCtrlC: false, exitSignals: [] })
try {
  // build tree, wire events
  await renderer.idle()
} finally {
  renderer.destroy()
  await renderer.closed
}
```

The `console` module replaces the process-wide `console` with a capture when `consoleMode` is
`"console-overlay"` (the default). A server console should pass `consoleMode: "disabled"` or set
`OTUI_USE_CONSOLE=false` so it does not swallow its own logging (`core-concepts/console.mdx`).

## 4. Pieces that matter for a server console

### Scrolling log view

`ScrollBoxRenderable` scrolls child renderables, owns scrollbars, and supports
`stickyScroll: true, stickyStart: "bottom"`, which pauses while the user scrolls up and resumes at
the bottom edge (`components/scrollbox.mdx`). Viewport culling is on by default for 16 or more
direct children: native code skips painting children outside the viewport, but Yoga still lays out
every child. There is no virtualization of the child list; each line is a live renderable.

Every renderable, text buffer, and text view takes a slot in a native object table whose default
capacity is 65,536 (`NativeSession.ts` line 287, `objectCapacity: 65_536`). Exhausting it throws
`NativeError ... ObjectLimit`; issue #1611 hit it at about 32,500 table cells.

Local measurements with `@opentui/core/testing` at 120x40, Node 26.12.1, Apple Silicon
(`perf.mjs`, `perf2.mjs`):

| Layout | Append one line and render one frame | Native frame time |
| --- | --- | --- |
| ScrollBox with 500 `Text` children | 1.9 ms | 3.6 ms |
| ScrollBox with 2,000 `Text` children | 3.4 ms | 2.5 ms |
| ScrollBox with 5,000 `Text` children | 6.6 ms | 6.0 ms |
| ScrollBox with 20,000 `Text` children | 42 to 58 ms | 38 to 41 ms |
| One `Text`, content set to the visible 38 lines of a 100k-line array | 0.46 ms | 0.7 ms |
| Same, with `StyledText` chunks per line | 0.19 ms | n/a |

Resident memory was 430 MB with 20,000 `Text` children on Node (320 MB on Bun) against a 91 MB
baseline on Node (26 MB on Bun). Issue #1493 (closed) reported native memory growth with 1,000
keyed `<text>` in a `<scrollbox>` under 10 Hz updates. Conclusion: a renderable per log line scales
to a few thousand lines; tens of thousands need a JS-side ring buffer with a windowed `Text` or a
custom renderable that draws only visible rows.

### ANSI escape sequences

Core does not parse ANSI SGR sequences into styled text. `stringToStyledText()` wraps a string in
one unstyled chunk (`packages/core/src/lib/styled-text.ts` lines 36-42). `lib/paste.ts` has
`stripAnsiSequences()` and `Textarea` strips pasted escapes. The only VT parser is
`EmbeddedTerminalRenderable`, which runs Ghostty's VT library inside the native artifact and is
meant for child-process output; it is a full terminal screen with scrollback, not a styled list
(`components/embedded-terminal.mdx`). The server's `consoleTextOf()`
(`packages/prismarine/src/chat/ConsoleText.ts`, imported by `packages/prismarine/src/Console.ts`)
currently emits ANSI; the console would need to build `StyledText` chunks from the structured chat
model instead, or pipe raw ANSI into an `EmbeddedTerminalRenderable`.

### Input line, history, completion

`InputRenderable` edits one line, emits `INPUT`, `CHANGE`, and `ENTER`, and accepts custom
`keyBindings` (`components/input.mdx`). Core has no command history and no completion; the only
"history" in `packages/core/src/renderables` is undo history in `EditBufferRenderable`. OpenCode
implements prompt history and completion in its own code (`packages/tui/src/prompt/history.tsx`,
`directory-completion.ts`, `frecency.tsx`). The existing `completeCommand()` helper in
`packages/prismarine/src/Console.ts` can drive an up/down history and a Tab completion popup built
from `Select` or `Text`.

### Status bar, overlays, tabs

A status bar is a `Box` with fixed `height: 1` in a column flex layout. Overlays use
`position: "absolute"` with `zIndex`; OpenCode's toast is an absolutely positioned `<box>` at
`top={1} right={2}` with hover handlers (`packages/tui/src/ui/toast.tsx` in opencode).
`TabSelectRenderable` gives a horizontal tab strip with `ITEM_SELECTED` and `SELECTION_CHANGED`
events and Left/Right/`[`/`]` keys (`components/tab-select.mdx`). `renderer.triggerNotification()`
sends OSC 9/99/777 desktop notifications when the terminal supports them
(`core-concepts/notifications.mdx`).

## 5. React, Solid, or plain core

- Plain core needs no JSX, no reconciler, and no extra runtime dependency. Components are classes
  that compose `Renderable`s and listen to events. Tests use `createTestRenderer()` from
  `@opentui/core/testing`, which builds a real `CliRenderer` writing to an in-memory sink and
  exposes `renderOnce()`, `waitForFrame()`, `captureCharFrame()`, `captureSpans()`, `mockInput`,
  and `mockMouse` (`core-concepts/testing.mdx`). This ran under Node 26 in the experiments above.
- React adds `react` 19.2+, `react-reconciler`, and unmarked peers `ws` and `react-devtools-core`.
  `tsconfig` needs `"jsx": "react-jsx"` and `"jsxImportSource": "@opentui/react"`.
  `@opentui/react/test-utils` wraps the test renderer in `act()`. The docs state there is no Node CI
  lane for React (`bindings/react.mdx`, `runtime-support.mdx`).
- Solid adds `solid-js` 1.9.12 pinned exactly plus Babel packages as runtime dependencies. On Bun
  it compiles TSX through a preload plugin; on Node the application must precompile TSX with
  `babel-preset-solid` in universal mode and alias `solid-js` to its `dist/solid.js` build
  (`bindings/solid.mdx`, "Configure Node compilation"). Solid has a Node source and packed CI lane on
  Linux x64. OpenCode uses Solid.
- Neither framework is required for a modular design; the renderable tree already is a component
  tree. The repository has no React or Solid today, and the Solid Node toolchain would add a Babel
  build step to the console package.

## 6. Known pitfalls

- Terminal detection is asynchronous; `renderer.capabilities` fields can be `false` for up to five
  seconds after start and then change. Subscribe to the `capabilities` event
  (`reference/terminal-capabilities.mdx`).
- `createCliRenderer()` does not require a TTY. With stdout redirected to a file and stdin from
  `/dev/null`, it created an 80x24 renderer, wrote 3,100 bytes of escape sequences (alternate screen
  on, capability queries, frame), and exited cleanly (`piped.mjs` experiment). The caller must
  decide on `process.stdout.isTTY` itself; core only skips `setRawMode` when stdin lacks it
  (`renderer.ts` lines 3602 and 4490).
- Raw mode and signals: the renderer sets raw mode on, replaces `console`, and installs eight signal
  handlers by default (section 3). In a process that also hosts the game server this would collide
  with the server's own shutdown handling; a separate console process avoids that.
- Windows: Windows Terminal is the tested path. Issue #1405 (open) describes `destroy()` leaving the
  stdin handle registered, which wedges legacy `conhost.exe`; PR #1726 (open) adds decoding for
  Windows Terminal's `win32-input-mode` keys, which currently arrive with an empty name. Bun 1.3 has
  no FFI on Windows arm64.
- Frame cost grows with the number of renderables, not with the number of changed cells
  (measurements in section 4). Keep the tree small.
- Memory: Node resident memory started at 91 MB for an empty test renderer. Tree-sitter assets load
  only when `Code` or `Markdown` is used (`runtime-support.mdx`, asset table).
- A `console.log` in the TUI process goes to the overlay capture unless `consoleMode` is
  `"disabled"`.
- `node:ffi` is Stability 1. The Node docs say invalid pointers can crash the process; OpenTUI's
  0.6 handle model turns stale handles into errors rather than memory faults (`releases/0.6.0.md`).

## 7. Prior art: OpenCode

OpenCode's TUI is `packages/tui` in `anomalyco/opencode`, a Solid app on `@opentui/core`,
`@opentui/solid`, and `@opentui/keymap` (its `package.json`). Structure:

- `src/component/` holds feature components, mostly `dialog-*.tsx` overlays, plus `session-tabs`,
  `panel-host`, `terminal-pane`, spinners.
- `src/ui/` holds generic widgets: `dialog.tsx`, `dialog-select.tsx`, `dialog-prompt.tsx`,
  `toast.tsx`, `border.ts`, `layout.ts`, `pane-resize.ts`, `select-controller.ts`.
- `src/context/` holds Solid contexts for keymap, theme, clipboard, log, panel, route, exit.
- `src/prompt/` holds history, completion, and mention parsing for the input line.
- `src/routes/session/` holds the message list with `rows.ts`, `mount-budget.ts`,
  `message-navigation.ts`, and `render-context.tsx`.
- `package.json` `imports` has `bun` and `node` conditions for sound, string width, and plugin
  support, so the package is written to run under both runtimes. Whether OpenCode ships a Node
  build was not checked; unverified.

No dedicated log viewer example was found in the OpenTUI repository. The closest built-in is the
console overlay, which keeps at most 2,000 entries and 3,000 display lines
(`core-concepts/console.mdx`).

## Implications for JSPrismarine

1. The TUI process does not have to run under Bun. `@opentui/core` 0.6.8 runs on Node 26.4+
   through `node:ffi`, and the headless renderer, a rolldown bundle, and a non-TTY start all worked
   on Node 26.12.1 here. The console process would still need a newer Node than the repository's
   `engines.node >=22.18.0`. Options: raise the engine for the console package only and refuse to
   start the TUI (fall back to the readline console) on older Node, or ship the TUI only inside the
   SEA, which is already built with Node 25.5+ (`scripts/package-sea.mts`) and could move to 26.
2. Keep the TUI in a child process of the server with a line-based IPC channel (log records in,
   commands out). That isolates raw mode, the signal handlers, and the `console` replacement from
   the game loop, which was the original goal.
3. Node 22 and 24 users cannot run OpenTUI at all, so the readline console has to stay as the
   fallback until Node 26 is the floor.
4. Use plain `@opentui/core` without React or Solid. The renderable tree is enough for a
   component-based design, it adds no JSX toolchain, and the core test renderer runs on Node.
5. Do not render one `Text` per log line beyond a few thousand lines. Keep log records in a JS
   ring buffer and render the visible window into one `Text` (or a small custom renderable); the
   measured cost was 0.2 to 0.5 ms per update versus 6 to 60 ms for large `ScrollBox` trees, and it
   stays clear of the 65,536 native object limit.
6. Build `StyledText` from the structured chat model rather than ANSI strings; core does not parse
   ANSI, and stripping would lose colors.
7. Pass `consoleMode: "disabled"`, `exitSignals: []`, `exitOnCtrlC: false`, and own shutdown
   with `destroy()` followed by `await renderer.closed`.
8. For the SEA, switch the bundle to ESM (`mainFormat: "module"`), add
   `execArgv: ["--experimental-ffi", "--no-warnings"]`, embed the `getNodeAssets()` manifest
   (the dylib alone if `Code` and `Markdown` are unused), and extract it to a temp directory before
   the TUI module runs. Repository CI for that path exists only on Linux x64, so test macOS and
   Windows builds locally.
9. Pin `@opentui/core` exactly. The project is 0.x with frequent releases and recent breaking
   minors.
