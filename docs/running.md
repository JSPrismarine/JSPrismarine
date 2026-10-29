---
title: Running JSPrismarine
group: Documents
category: Guides
---

# Running JSPrismarine

## 1. Prerequisites

*   1.1 Node.js `>=26.4.0` and pnpm `>=12`. The terminal UI loads `node:ffi` by default on
    Node 26.9 or newer. Node versions 26.4 through 26.8 require `--experimental-ffi`. If Node cannot
    load `node:ffi`, the server uses the plain line console (see [Console](#4-console)).

pnpm is the only supported package manager. Installs with npm or yarn fail
with a message pointing back to pnpm, and repository tooling runs one-off
tools through `pnpm dlx` (or `pnpx`) rather than `npx`.

*   1.2 A JDK 25 or newer, to run the default overworld. See
    [World generation data](#13-world-generation-data) below for what it is for and how to skip it.

The Bedrock resources are a pinned download, verified by hash and cached under
`node_modules/.cache/jsprismarine/`. You don't need to fetch it yourself:
`pnpm install`, `pnpm run dev` and the bedrock-data build all fetch it when it
is missing. Offline from a cold cache, point `JSP_CLOUDBURST_DATA_PATH` at a
local CloudburstMC/Data checkout.

### 1.3 World generation data

The default `Overworld` generator builds terrain from Mojang's published Java Edition world
generation data. That data is not shipped with this server; it comes from a pinned Java Edition
server jar that `pnpm run dev` fetches and runs Mojang's data generator against, caching the
result under `node_modules/.cache/jsprismarine/`.

This happens automatically the first time you run `pnpm run dev`, and takes a 62 MB download and
a couple of minutes. Afterwards the step compares a few file names and exits, so later runs are
instant and need no network.

`pnpm install` does not do this, so installing stays quick for anyone who only builds or tests
the repository. `pnpm run start` does not do it either; a production host arranges the cache
once, or points `JSP_VANILLA_DATAPACK` and `JSP_JAVA_REPORTS` at a copy produced elsewhere.

Running the data generator needs a JDK 25 or newer. JSPrismarine looks at `JSP_JAVA_HOME`,
`JAVA_HOME`, the `java` on your `PATH` and, on macOS, `/usr/libexec/java_home`; set
`JSP_JAVA_HOME` if you have several and want to choose. Without a JDK, `pnpm run dev` stops with
a message instead of starting a broken world.

To run with no Java at all, set `generator` to `Flat` for your world in `jsp/config.json`. A flat
world needs none of this data. It is also not Minecraft terrain, so this is a deliberate choice
rather than a fallback the server makes for you.

To arrange the cache by hand, or to refresh it:

```bash
    $ pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen
```

## 2. Install dependencies

```bash
    # Install npm dependencies
    $ pnpm install
```

## 3. Running

```bash
    # Development: runs from source, restarts on file changes, opens the terminal UI
    $ pnpm run dev

    # Production (you should probably be using the prebuilt version however)
    $ pnpm run build
    $ pnpm run start
```

`pnpm run dev` is `prismarine --watch`: the server runs from TypeScript source and restarts when
a watched source file or content pack data changes.
`pnpm run start` runs the same entry point without the watcher. Both open the terminal UI
described in the next section when they can, and fall back to the plain line console otherwise.

### Live debugging and profiling

Add `--devtools` to a development run to open Node's inspector and enable JSPrismarine timing
traces:

```bash
pnpm run dev -- --devtools
```

The server prints an HTTPS DevTools URL. Open it in Chrome, Edge, or an app webview that cannot
open Chrome's local `devtools://` URLs to set breakpoints, inspect live JavaScript objects, record
CPU profiles, and take heap snapshots. The inspector listens on `127.0.0.1`; it allows code
execution in the server process, so keep it on the local machine. When DevTools is enabled, the
Console also shows JSPrismarine logger records alongside JavaScript `console` calls.

For startup debugging, use `pnpm run dev -- --devtools-wait`. This enables DevTools and waits
before reading server configuration or constructing the server. Attach a debugger, set your
breakpoints, and resume startup. Static module imports have already run at this point. The
`jsprismarine` handle becomes available after the server is constructed. In watch mode, the host
keeps the printed frontend and inspector URLs stable and reconnects the open frontend to each new
server process. With `--devtools-wait`, each replacement process waits for the same frontend to
resume it.

The printed `JSPrismarine inspector:` WebSocket URL also accepts external Chrome DevTools
Protocol clients. Node's V8 debugger supports line and conditional breakpoints, function-call
breakpoints, stepping, exception pauses, scope inspection, and evaluation on paused call frames.
`Debugger.setInstrumentationBreakpoint` supports `beforeScriptExecution` and
`beforeScriptWithSourceMapExecution`. These pause before script execution; browser DOM, XHR,
and event-listener breakpoints do not apply to this Node server. A debugger client must enable
`Debugger`, install startup breakpoints, and send `Runtime.runIfWaitingForDebugger` to release
`--devtools-wait`. Use an external client so pausing the server does not also pause its debugger.
Source-map-aware clients can map TypeScript locations to the JavaScript executed by V8.

The DevTools Console exposes a `jsprismarine` handle to live server objects:

```javascript
jsprismarine.server.getTick()
jsprismarine.worlds()
jsprismarine.entities('world')
jsprismarine.entityRuntime('minecraft:overworld').runtime
```

This uses the server's world and entity registries, so data-driven entities and their runtime
state remain inspectable through the same model the server runs. On graceful shutdown, the
server writes a Chrome trace to `jsp/profiles/` (or the configured `JSP_DIR/profiles/`). Import
the `.trace.json` file in DevTools' Performance panel to inspect tick phases, world update
phases, and event-loop delay. A forced process exit cannot save the trace.

The macOS app opens Terminal so the server can use its interactive console. Its config, world, and
log files are stored in `~/JSPrismarine`.

## 4. Console

The `prismarine` entry point picks one of two console modes at startup.

The terminal UI (TUI) is used when stdin and stdout are a terminal, `TERM` is not `dumb`,
neither `CI` nor `JSP_NO_TUI` is set, `--no-tui` was not passed, and Node can load `node:ffi` (by
default on 26.9 or newer, or with `--experimental-ffi` on 26.4 through 26.8). The
UI draws the log, a status bar with TPS, player count, memory, and uptime, and an input line with
history and command completion. In this mode the process you started is a host: it owns the
terminal and runs the server as a child process, so a crash or a `--watch` restart of the server
never leaves your terminal in a broken state. A Node with `node:ffi` is required because the renderer is
loaded through `node:ffi`, which arrived in that release.

The plain line console is used elsewhere, including in Docker, under systemd, in hosting panels
that feed stdin, over pipes, and in CI. In that mode, the server runs in-process and behaves like
a classic console program. Each line you write to stdin runs as a command, and each log record is
one plain line on stdout, so `docker logs` and panel log viewers show exactly what the log file
does. If Node cannot load `node:ffi`, the server prints one line naming the reason before startup.

You can force plain mode with the `--no-tui` flag or by setting `JSP_NO_TUI=1` in the
environment. The environment variable is the right choice for container images and service
units, since it applies even when someone runs the image with `-it`. The repository `Dockerfile`
sets it.

The remaining flags:

*   `--watch` restarts the server when a workspace source file or a loaded pack's data changes,
    and regenerates `bedrock-data` first when its resources or generator changed. `pnpm run dev`
    passes it for you. The watcher's own state (watching, change detected, generating, restarting,
    exited) shows in the TUI status bar rather than in the log.
*   `--headless` runs the server with no console at all: stdin is left alone and nothing is
    read from it. Use it when a wrapper owns the terminal and only the log file matters.
*   `--no-tui` forces the plain line console even on an interactive terminal.

### Keys in the terminal UI

Press `?` on an empty input line to open the help overlay, which lists every binding. The ones
you'll need first:

| Key | What it does |
| --- | --- |
| `Enter` | Run the typed command |
| `Up` / `Down` | Move through command history |
| `Tab` | Complete the command name |
| `Ctrl+C` | Clear the input line. Pressing it again on an empty line within two seconds stops the server; a press while the server is stopping kills it. |
| `PgUp` / `PgDn` | Scroll the log. Scrolling up pauses following so new lines don't move what you're reading. |
| `End` | Jump to the newest line and resume following |
| `Ctrl+L` | Clear the visible log (the buffer is kept) |
| `?` | Help overlay, on an empty line |
| `Esc` | Close an overlay or cancel a search |

## 5. Configuration

New servers keep their settings in `config.json` in the working directory
(`jsp/` during development). The server creates it on first start, with every
setting preceded by a comment explaining it and a `$schema` URL for the
matching package version.

The file is yours to edit. The server only ever changes the key it is
writing: your comments, blank lines and the order of the keys stay as they
are. When a new version adds a setting, the server adds that key and its
comment to the end of your file and leaves the rest alone, so there is no
need to regenerate the file after an upgrade.

### World seeds

Write a world's `seed` as a string:

```json
{
    "worlds": {
        "world": { "generator": "Overworld", "provider": "LevelDB", "seed": "8475011743740320021" }
    }
}
```

A Minecraft seed is a 64-bit integer and a JSON number is a double, which is
exact only below 2^53. Written as a number, `8475011743740320021` is read back
as `8475011743740319744` and generates a different world. A number still works
and is exact for seeds below 2^53.

The string is read the way Java reads the text in its world creation box: a
value that parses as a 64-bit integer is that integer, and anything else is
its `String.hashCode`, so `"glacier"` is seed 108181935 here and in Java. An
absent or empty seed is 0.

The same applies to the JSON files beside it (`banned-players.json`,
`ops.json`, and `permissions.json`) and player data: the server changes the
entry it means to and leaves your comments in place. These files may hold
`//` and `/* */` comments and trailing commas. On startup, the server imports
an older world's `level.json` once into its provider and removes the file after
the migration succeeds.

The published `@jsprismarine/prismarine` package includes Draft 7 JSON
Schemas under `schemas/`. Each reference uses the exact package version that
wrote the file, served from UNPKG, so a standalone server or binary does not
need a separate npm install to make the schema available. Object files such as
`config.json`, `permissions.json`, and fallback player data contain
a `$schema` property. The root of `ops.json` and `banned-players.json` is an array, so those
files instead start with a `JSPrismarine schema` comment holding the versioned
URL. To validate those arrays in VS Code, map the file names in
`settings.json` and replace the URL placeholders with each file's exact URL:

```json
{
    "json.schemas": [
        { "fileMatch": ["ops.json"], "url": "<copy the JSPrismarine schema URL from ops.json>" },
        {
            "fileMatch": ["banned-players.json"],
            "url": "<copy the JSPrismarine schema URL from banned-players.json>"
        }
    ]
}
```

The schemas allow comments and trailing commas in editors that support JSONC.

A file that does not parse stops the server with an error naming the file
rather than being replaced by the defaults, so a typo costs a restart, not
the config.

## 6. How the development server works

`pnpm run dev` runs the server from TypeScript source with `--watch`. No build step is needed:
every `@jsprismarine/*` package resolves straight to its `src/`, so an edit in any package takes
effect on the next restart.

The host process watches workspace package sources and data files under every directory in the
resolved content stack: the vanilla Bedrock pack, `packages/blocks/vanilla_overlay/`,
`packages/entities/vanilla_overlay/`, the Java vanilla datapack, and packs configured through
`content-world-packs` or `content-datapacks`.
Explicit `JSP_VANILLA_BEHAVIOR_PACK` and `JSP_VANILLA_DATAPACK` paths are included in that stack.
Pack JSON, `pack.mcmeta`, `.mcfunction`, and `.brarchive` changes share one debounce, so a batch of
edits causes one graceful server restart and rebuilds the registries from disk. Content registries
are built at startup and use positional IDs, so changing them in place would leave running clients
and entities with stale data. Because the console lives in the host and the server is a child
process, the console keeps working across restarts. If the server crashes while you are mid-edit,
the host stays up and starts the server again on your next change.
Changing the `bedrock-data` resources or its generator regenerates the data before the restart.

### Dropping packets to find a bad one

When a client leaves during the join without a `Disconnect` or
`PacketViolationWarning`, the server log alone does not say which packet it
choked on. Set `JSP_DEBUG_DROP_PACKETS` to a comma-separated list of packet
class names and the server never sends those, logging a warning for each one
it withholds:

```bash
    $ JSP_DEBUG_DROP_PACKETS=LevelChunkPacket,CraftingDataPacket pnpm run dev
```

Drop one type at a time and watch whether the client's behavior changes. A
batch of several packets is dropped whole when any packet in it is named.

Once a packet type is implicated, `JSP_DEBUG_DUMP_PACKETS` takes the same
kind of list and writes each named packet's encoded bytes, header included,
to a file of its own under `JSP_DEBUG_DUMP_DIR` (default: a
`jsprismarine-packets` directory in the system temp directory). That is the
exact byte sequence the client was given, ready to decode against the
protocol documentation. A packet can be dumped and dropped at the same time.

The variables are read when a connection is made, so they can also go in
`packages/server/.env.development.local`, which the server loads at startup.
Remove them when done; a server with packets missing is not one players can
use.
