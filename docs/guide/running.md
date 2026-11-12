---
title: Running JSPrismarine
description: Download the prebuilt server and run it, or run it from source with pnpm run dev to work on it.
group: Documents
category: Guides
outline: [2, 3]
---

# Running JSPrismarine

There are two ways to run JSPrismarine:

- **To host or play on a server, download the prebuilt server.** It is one file with everything
  inside, so you need no Node.js, pnpm, Java or checkout of this repository.
  See [Run the prebuilt server](#run-the-prebuilt-server).
- **To write add-ons or plugins, or to work on JSPrismarine itself, run it from source with
  `pnpm run dev`.** It rebuilds and restarts the server whenever you change a file.
  See [Run from source](#run-from-source), and [Extending JSPrismarine](extending.md) for what an
  add-on or a plugin can do.

The [console](#console) and [configuration](#configuration) work the same either way.

## Run the prebuilt server

Each release on GitHub ships the server as a standalone executable. Download it from the
[JSPrismarine releases](https://github.com/JSPrismarine/JSPrismarine/releases?q=jsprismarine%40&expanded=true):
releases tagged `jsprismarine@<version>` carry the executables. The ones marked _Pre-release_ are
nightly builds of `master`.

| Platform | File |
| --- | --- |
| Linux, x64 | `prismarine-linux-x64` |
| Linux, ARM64 | `prismarine-linux-arm64` |
| Linux with musl (Alpine), x64 or ARM64 | `prismarine-linux-x64-musl`, `prismarine-linux-arm64-musl` |
| macOS, Apple silicon | `prismarine-darwin-arm64`, or the app in `JSPrismarine-arm64.app.zip` |
| Windows, x64 | `prismarine-windows-x64.exe` |

Nightly pre-releases are built for fewer platforms: Linux x64, macOS on Apple silicon and Windows
x64. They follow changes to `master` on their own, and a maintainer can publish one at any time by
running the Executable workflow on `master` from the repository's Actions tab.

Put the file in the folder you want the server to live in, then run it from there:

```bash
# Linux and macOS: mark the download as executable once
chmod +x prismarine-linux-x64
./prismarine-linux-x64
```

```powershell
# Windows
.\prismarine-windows-x64.exe
```

The macOS builds are signed ad hoc, not notarized by Apple, so macOS refuses to open one a browser
downloaded. Clear the download flag once with `xattr -d com.apple.quarantine prismarine-darwin-arm64`
(or the app's name), or Control-click the app and choose **Open**. On Windows, SmartScreen may warn
about an unrecognized app; choose **More info**, then **Run anyway**.

The first start needs a network connection and takes a minute. The server unpacks the data it
carries (Mojang's Java Edition world generation data and this project's packs) into
`node_modules/.cache/jsprismarine/` in the folder it starts in. It then downloads the vanilla
behavior pack from Mojang's Bedrock Dedicated Server (about <!-- fact:bds.size -->95 MB<!-- /fact -->), checking its digest, because
Mojang's license does not allow shipping that pack inside the executable. The pack goes to your
user cache directory: <!-- fact:cache.windows -->`%LOCALAPPDATA%\JSPrismarine\Cache`<!-- /fact --> on Windows,
<!-- fact:cache.macos -->`~/Library/Caches/JSPrismarine`<!-- /fact --> on macOS and <!-- fact:cache.xdg -->`$XDG_CACHE_HOME/jsprismarine`<!-- /fact --> (or
<!-- fact:cache.linux -->`~/.cache/jsprismarine`<!-- /fact -->) elsewhere. A server started from any folder reuses it, and a build pinned
to a newer Bedrock Dedicated Server downloads that version once. On a machine that cannot reach
Mojang's servers, set `JSP_VANILLA_BEHAVIOR_PACK` to a copy of a Bedrock Dedicated Server
`behavior_packs` folder.

The server then creates `config.json`, its player lists and `worlds/` in the same folder and starts
listening on port <!-- fact:server.port -->19132<!-- /fact -->. Players add it in Minecraft under **Servers → Add Server** with your
machine's address. In a terminal, it opens the [terminal UI](#console); under a service manager,
in Docker or with `--no-tui`, it uses the plain line console.

To update, replace the executable with the newer one and start it again. Your `config.json`,
worlds and player lists stay as they are, and the server unpacks the new version's data on its
first start.

## Run from source

Run from source when you are building add-ons or plugins, or changing JSPrismarine: `pnpm run dev`
rebuilds the packages you edit and restarts the server with your changes. The steps below set up
a checkout.

### 1. Prerequisites

*   1.1 Node.js <!-- fact:node.minimum -->`26.4.0`<!-- /fact --> or newer and pnpm <!-- fact:pnpm.minimum -->`12`<!-- /fact --> or newer. The terminal UI loads `node:ffi` by default on
    Node 26.9 or newer. Node versions 26.4 through 26.8 require `--experimental-ffi`. If Node cannot
    load `node:ffi`, the server uses the plain line console (see [Console](#console)).

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

#### 1.3 World generation data

The default world preset, `minecraft:normal`, builds terrain from Mojang's published Java
Edition world generation data. That data is not shipped with this server; it comes from a
pinned Java Edition server jar that `pnpm run dev` fetches and runs Mojang's data generator
against, caching the result under `node_modules/.cache/jsprismarine/`.

This happens automatically the first time you run `pnpm run dev`, and takes a <!-- fact:java.size -->62 MB<!-- /fact --> download and
a couple of minutes. Afterwards the step compares a few file names and exits, so later runs are
instant and need no network.

`pnpm install` does not do this, so installing stays quick for anyone who only builds or tests
the repository. `pnpm run start` does not do it either; a checkout run that way arranges the cache
once, or points `JSP_VANILLA_DATAPACK` and `JSP_JAVA_REPORTS` at a copy produced elsewhere. The
[prebuilt server](#run-the-prebuilt-server) needs none of this: it carries the data inside. The
repository `Dockerfile` generates the data while it builds the image, using the JDK in its build
stage, and the build fails if the data cannot be produced.

Running the data generator needs a JDK 25 or newer. JSPrismarine looks at `JSP_JAVA_HOME`,
`JAVA_HOME`, the `java` on your `PATH` and, on macOS, `/usr/libexec/java_home`; set
`JSP_JAVA_HOME` if you have several and want to choose. Without a JDK, `pnpm run dev` stops with
a message instead of starting a broken world.

To run with no Java at all, set `preset` to `minecraft:flat` for your world in `jsp/config.json`
(see [Worlds](#worlds)). A flat world needs none of this data. It is also not Minecraft terrain,
so this is a deliberate choice rather than a fallback the server makes for you.

To arrange the cache by hand, or to refresh it:

```bash
    $ pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen
```

`pnpm dev` also runs `ensure:bedrock-pack`, which downloads Mojang's Bedrock Dedicated Server archive
once so the server can read the vanilla behavior pack. Without it the server logs a warning and runs
with no mobs, no `/summon` and no dragon. Run it by hand with
`pnpm --filter @jsprismarine/bedrock-data run ensure:bedrock-pack`.

### 2. Install dependencies

```bash
    # Install npm dependencies
    $ pnpm install
```

### 3. Running

```bash
    # Runs the server, rebuilds and restarts it on source changes, and opens the terminal UI
    $ pnpm run dev
```

`pnpm run dev` is the way to run a checkout, for add-on and plugin work as much as for work on the
server. It is `prismarine --watch`: it builds the server and its workspace packages once, then runs
the compiled entry next to `vite build --watch` for each package, so there is no TypeScript loader in
the server process or its workers. Editing a source file rebuilds that package, and the server restarts
when its `dist` output or content pack data changes. The first restart a few seconds after start-up is
the watch builds writing their initial output. The watch builds log to
`node_modules/.cache/jsprismarine-dev-build.log` so they stay out of the terminal UI. It opens the
terminal UI described in the [Console](#console) section when it can, and falls back to the plain
line console otherwise.

#### Building the server yourself

You rarely need these: to host a server, [download the prebuilt one](#run-the-prebuilt-server).
They exist for checking a production build, for platforms the releases do not cover, and for
working on the packaging itself.

`pnpm run start` runs the compiled entry once, without the watcher, and does not build. Run
`pnpm run build` first, and again after each change.

The released executables are compiled with Bun by `.github/scripts/build-aot.mjs`, which the
release and nightly workflows run for each platform. That script needs the build metadata the
workflows set, so the workflows are the supported way to produce release builds.

`pnpm run package` builds a different executable locally: `dist/prismarine`, a Node single
executable application, with `scripts/package-sea.mts`. It needs Node 25.5 or newer, and a
checkout whose world generation cache is warm: run
`pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen` and
`pnpm --filter @jsprismarine/bedrock-data run extract:structures` first, because the executable
carries that data inside it: the Java vanilla datapack, the biome parameter reports, the structure
templates, and this project's overlay packs. The build enables Node's SEA code cache for the main
entry. To build a comparison without it, save the first executable before running
`pnpm run package -- --no-code-cache`; the remaining packaging inputs stay the same. On first run it
provisions its data the way the prebuilt server does. It uses the plain line console, and embeds
the default chunk worker and generation pipelines as SEA assets, so terrain workers can run without
importing modules from disk. If an asset is missing or a custom pipeline is not embedded, the
server logs the reason and generates terrain on the server thread instead.

`pnpm run package:scriptc` is an experimental ahead-of-time build. It embeds no data and does
not provision any on first run yet, so its output needs a directory whose
`node_modules/.cache/jsprismarine/` was arranged by a checkout, or the `JSP_*` override
variables above.

#### Live debugging and profiling

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
jsprismarine.levels()
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

### 4. How the development server works

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

#### Dropping packets to find a bad one

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
The server creates the directory readable only by its own user and refuses to
dump into one that is a symbolic link, belongs to another user, or other users
can write to. Each file gets a random suffix and is created new, never
overwritten.

The variables are read when a connection is made, so they can also go in
`packages/server/.env.development.local`, which the server loads at startup.
Remove them when done; a server with packets missing is not one players can
use.

## Console

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

## Configuration

New servers keep their settings in `config.json` in the working directory
(`jsp/` during development). The server creates it on first start, with every
setting preceded by a comment explaining it and a `$schema` URL for the
matching package version.

The file is yours to edit. The server only ever changes the key it is
writing: your comments, blank lines and the order of the keys stay as they
are. When a new version adds a setting, the server adds that key and its
comment to the end of your file and leaves the rest alone, so there is no
need to regenerate the file after an upgrade.

Older servers kept their settings in `config.yml` or `config.yaml`. The server
does not read those files and ignores them if they exist. Move any settings you
still need into `config.json` (where `//` comments are allowed).

`packet-full-flush-fragments` is an opt-in compression prototype. It stays off by default until
the server has been checked with retail Bedrock clients on Windows and Android.

### Every setting

A fresh server writes these <!-- fact:config.count -->38<!-- /fact --> settings, each with the comment below
above it. The list comes from the code that writes the file, so it matches what your version writes.

<!-- fact:config.table -->
| Setting                               | What it does                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `log-level`                           | How much the console and the log file say: error, warn, info, verbose, debug or silly.                                                                                                                                                                                                                                                              |
| `server-port`                         | The port the server listens on, as Bedrock Dedicated Server's server-port: TCP for NetherNet signaling, and UDP for RakNet and NetherNet. Unless server-udp-ports or query-port is set, RakNet's IPv4 listener, NetherNet's players and query all use this one UDP port; RakNet's IPv6 listener uses server-portv6. Bedrock clients look for 19132. |
| `server-portv6`                       | The UDP port RakNet listens on for IPv6 clients when server-ip is 0.0.0.0. Bedrock clients look for 19133. It may equal server-port.                                                                                                                                                                                                                |
| `server-ip`                           | The address to listen on. 0.0.0.0 accepts connections on every interface.                                                                                                                                                                                                                                                                           |
| `level-name`                          | Which entry of `worlds` players join.                                                                                                                                                                                                                                                                                                               |
| `worlds`                              | Every world the server loads, by name, with its preset, provider and seed. Write the seed as a string; a 64-bit seed written as a number is rounded.                                                                                                                                                                                                |
| `max-players`                         | How many players may be online at once.                                                                                                                                                                                                                                                                                                             |
| `gamemode`                            | The default game mode for new players: survival, creative, adventure or spectator.                                                                                                                                                                                                                                                                  |
| `difficulty`                          | How dangerous the monsters are: peaceful, easy, normal or hard.                                                                                                                                                                                                                                                                                     |
| `motd`                                | The message shown in the server list.                                                                                                                                                                                                                                                                                                               |
| `view-distance`                       | How far players see, in chunks.                                                                                                                                                                                                                                                                                                                     |
| `preload-radius`                      | How many chunks around spawn to generate before accepting players. 0 skips it.                                                                                                                                                                                                                                                                      |
| `chunk-workers`                       | How many worker threads to use for chunk generation. 0 keeps it on the server thread.                                                                                                                                                                                                                                                               |
| `chunk-host`                          | Where chunk generation workers run: process (the default) starts a separate low-priority generation process and falls back to threads when it cannot, in-process keeps them in the server process.                                                                                                                                                  |
| `terrain-cache-size-mb`               | How many megabytes of generated terrain to keep on disk so it is not rebuilt after a restart. 0 turns the cache off.                                                                                                                                                                                                                                |
| `chunk-send-budget-ms`                | How long each tick may spend sending chunks, out of its 50 ms.                                                                                                                                                                                                                                                                                      |
| `proximity-broadcast`                 | Whether positional packets only go to players near them. Turn off only to debug.                                                                                                                                                                                                                                                                    |
| `server-authoritative-block-breaking` | Whether the server times block breaking, as a Bedrock Dedicated Server does. Off leaves it to the client.                                                                                                                                                                                                                                           |
| `entity-tracking-hysteresis`          | Chunks past view distance before an entity leaves a player's screen.                                                                                                                                                                                                                                                                                |
| `entity-tracking-interval`            | Ticks between entity visibility passes, at least 1.                                                                                                                                                                                                                                                                                                 |
| `online-mode`                         | Whether players must be signed in to Xbox Live.                                                                                                                                                                                                                                                                                                     |
| `enable-raknet`                       | Whether to accept clients over RakNet, the UDP transport Bedrock used before NetherNet.                                                                                                                                                                                                                                                             |
| `use-raknet-worker`                   | Whether RakNet networking runs in a worker thread.                                                                                                                                                                                                                                                                                                  |
| `enable-nethernet`                    | Whether to accept clients over NetherNet, the WebRTC transport Bedrock Dedicated Server defaults to.                                                                                                                                                                                                                                                |
| `enable-server-public-ip-lookup`      | Whether NetherNet looks up the public address when server-public-ip is empty, by asking a few free web services at startup, and offers it to a player whose join would otherwise carry no public address. Off, it offers only what server-public-ip and the player give it. Ignored when enable-nethernet is off.                                   |
| `enable-lan-visibility`               | Whether players on the local network see the server among their LAN games.                                                                                                                                                                                                                                                                          |
| `packet-compression-level`            | The zlib level for outgoing batches, from -1 (zlib's default) to 9.                                                                                                                                                                                                                                                                                 |
| `packet-compression-algorithm`        | The batch algorithm advertised to clients: zlib (default), snappy, or none. Other choices may use more bandwidth or differ in client support.                                                                                                                                                                                                       |
| `packet-compression-threshold`        | The smallest batch body to compress, in bytes. 0 leaves every batch uncompressed.                                                                                                                                                                                                                                                                   |
| `packet-full-flush-fragments`         | Prototype: reuse independently compressed packet fragments. Requires retail client validation.                                                                                                                                                                                                                                                      |
| `enable-query`                        | Whether to answer the GameSpy4 query protocol that server lists and status tools use.                                                                                                                                                                                                                                                               |
| `enable-process-title`                | Whether to show the tick rate in the process title. Some terminals redraw slowly.                                                                                                                                                                                                                                                                   |
| `enable-ticking`                      | Whether the world ticks. Off is only for tests, which step the ticks by hand with Server.advanceTick. Until one does, nothing a tick runs happens: no chunks go out, so a joining client never spawns.                                                                                                                                              |
| `log-excluded-packets`                | Packet class names kept out of the traffic log at the silly level.                                                                                                                                                                                                                                                                                  |
| `crafting-recipe-limit`               | How many recipes to send: -1 for all, 0 for none, or a cap.                                                                                                                                                                                                                                                                                         |
| `content-strict`                      | Whether a pack that reports an error stops the server instead of loading short.                                                                                                                                                                                                                                                                     |
| `content-world-packs`                 | Extra behavior pack directories this world loads, after the vanilla ones.                                                                                                                                                                                                                                                                           |
| `content-datapacks`                   | Java datapack directories this world loads, after the vanilla one.                                                                                                                                                                                                                                                                                  |
<!-- /fact -->

The server also reads these <!-- fact:config.optionalCount -->3<!-- /fact --> settings, which a fresh file leaves out. Add one to
`config.json` to set it; left out, it keeps the default its description gives.

<!-- fact:config.optionalTable -->
| Setting            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server-udp-ports` | The UDP ports NetherNet players use, as Bedrock Dedicated Server's server-udp-ports. A single port, such as 19489, puts every player on it. A range, such as 19400-19500, spreads players over its ports and reuses a port once every port has a player. Either can be a public:local mapping for a server behind NAT or port forwarding, such as 29489:19489 or 21200-21300:19400-19500, with the same number of ports on each side. Commas join entries whose local ports form one continuous range. Unset or empty, it is server-port, shared with RakNet. A port that is also server-port or server-portv6 is shared with RakNet. Ignored when enable-nethernet is off. |
| `server-public-ip` | The address NetherNet advertises to players, as Bedrock Dedicated Server's server-public-ip: set it when the server is behind NAT, a firewall or port forwarding. A raw IPv4 or a raw or [bracketed] IPv6, with no port or hostname. Empty advertises the host's own addresses and, to a player joining by address, the address that player typed. Ignored when enable-nethernet is off.                                                                                                                                                                                                                                                                                    |
| `query-port`       | The UDP port the query protocol answers on. Unset, or the same as server-port, query shares the RakNet socket with the game.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
<!-- /fact -->

### Networking

Bedrock clients reach the server over two transports, and it runs both unless `enable-raknet` or
`enable-nethernet` turns one off:

| Transport | Ports | Used by |
| --- | --- | --- |
| RakNet | UDP `server-port` | Clients that join over Bedrock's UDP transport |
| RakNet over IPv6 | UDP `server-portv6`, when `server-ip` is `0.0.0.0` | Clients that reach the server over IPv6 |
| NetherNet | TCP `server-port` to set up the connection, then UDP `server-udp-ports` | Clients that join by address the way Bedrock Dedicated Server expects |
| LAN | UDP <!-- fact:nethernet.lanPort -->7551<!-- /fact -->, with `enable-lan-visibility` on | Players on your local network, who see the server among their LAN games |

A fresh `config.json` names `server-port` and `server-portv6`, 19132 and 19133, the ports
Bedrock clients look for. `server-udp-ports` and `query-port` are left out and follow
`server-port`:

| Set in the config | RakNet IPv4 | RakNet IPv6 | NetherNet signaling (TCP) | NetherNet UDP |
| --- | --- | --- | --- | --- |
| The defaults | `server-port` | `server-portv6` | `server-port` | `server-port`, shared with RakNet |
| `server-udp-ports` too | `server-port` | `server-portv6` | `server-port` | `server-udp-ports` |

So with the defaults a firewall needs `server-port` open for UDP and TCP, and `server-portv6` for
UDP when IPv6 clients should reach the server. RakNet and NetherNet share the UDP port: the server
sorts each datagram by its first bytes and hands it to the transport it belongs to. The IPv6
listener takes IPv6 traffic only, so `server-portv6` may equal `server-port`. A server bound to
one IPv4 address through `server-ip` does not listen on IPv6 at all. A config from before this
release keeps the ports it names: its `port` is renamed `server-port` when the server loads it,
and a file that has both is refused.

Every transport that is on must be able to listen. When another program holds `server-port`,
`server-portv6` or the TCP side of `server-port` that NetherNet signals on, the server does not
start, and its error names the transport, the port and the cause. Turn the transport off with
`enable-raknet` or `enable-nethernet`, or free the port. The LAN port is different: only one
program on a machine can hold it, and when another server or a game already holds it, the server
starts anyway and logs that it is not visible on the local network.

`server-udp-ports` moves NetherNet's UDP elsewhere, as Bedrock Dedicated Server's setting does: one
port every player shares, or a range players are spread over. Behind NAT or port forwarding, a
`public:local` mapping and `server-public-ip` tell players the address and ports to reach, and the
server adds them to every answer beside its own interface addresses. A value Bedrock Dedicated
Server refuses stops the start with its message.

A player who joins by address also gets the address they typed in the answer, when the server's own
addresses do not include it. So a server in a container or behind port forwarding takes joins
without `server-public-ip`, as long as the UDP port is forwarded like the TCP one: with the
defaults, the same public port for both. The server takes the address from the request's `Host`
header and resolves a hostname through DNS. Set `server-public-ip` when players reach signaling
through a proxy on another address, and when the log warns that a join was offered no public
address.

With `server-public-ip` empty, the server looks up its public address when NetherNet starts, by
asking a few free web services in turn, and logs the address it found. A join whose answer would
otherwise carry no public address gets that one. When every service fails, the log warns and joins
are answered as before. Set `enable-server-public-ip-lookup` to `false` to stop the lookup. A server
bound to a loopback address skips it.

NetherNet runs on a native library that the server's package downloads when it is installed. Where
it cannot load, the server does not start with NetherNet on, and its error says how to fix it;
`"enable-nethernet": false` runs the server on RakNet alone.

The first time NetherNet starts, the server writes its identity key to
<!-- fact:nethernet.identityFile -->`nethernet-identity.pem`<!-- /fact --> in its data directory.
Clients remember the key, and one that meets a different key asks the player to trust the server
again, so keep the file with your worlds when you move or rebuild the server.

### Query

With `enable-query` on, which is the default, the server answers the GameSpy4 query protocol
that server lists and status tools use to read its MOTD, world, player count and player names. A
tool asks for a challenge token first and gets a status reply only by sending that token back, so
a forged source address cannot turn the server into an amplifier.

A basic stat carries what a server list shows: the MOTD, the world, and the online and maximum
player counts. A full stat adds the Minecraft version the server advertises, the software and
its version, as `server_engine` and as `plugins`, and the names of the players online. `plugins`
lists no plugins yet.

`query-port` picks the UDP port. Left out, as a fresh config leaves it, query answers on
`server-port`, on the RakNet socket beside the game, so a firewall needs nothing more. Any other port gets a socket of
its own, bound to `server-ip`; when another program holds that port, the server starts anyway and
logs that query is unavailable.

### Worlds

Each entry under `worlds` is one world: its `seed`, the `provider` that stores it on disk and
the `preset` that says which dimensions it has and how each one generates. The server loads
every entry; `level-name` picks the one players join. The preset is a Java
`worldgen/world_preset` id. `minecraft:normal`, the default, is the Overworld, the Nether and
the End with vanilla terrain; `minecraft:flat` is a superflat Overworld that needs no Java data;
`minecraft:large_biomes` and `minecraft:amplified` are the other two vanilla presets.
[dimensions.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/data-driven/dimensions.md) describes every key and what is behind them.

```json
{
    "worlds": {
        "world": { "preset": "minecraft:normal", "provider": "LevelDB", "seed": "8475011743740320021" }
    }
}
```

`dimensions` changes one dimension at a time without giving up the rest of the preset. Each key
is a Java dimension id, and its entry may set the dimension's `type`, its `generator` or when
it loads. A key you leave out comes from the preset, and an id the preset doesn't have adds a
dimension. This world keeps the Nether and the End from `minecraft:normal` but makes its
Overworld flat, with the same `generator` object a Java datapack writes in a `dimension` file:

```json
{
    "worlds": {
        "world": {
            "seed": "8475011743740320021",
            "provider": "LevelDB",
            "preset": "minecraft:normal",
            "dimensions": {
                "minecraft:overworld": {
                    "generator": {
                        "type": "minecraft:flat",
                        "settings": {
                            "biome": "minecraft:plains",
                            "layers": [
                                { "block": "minecraft:bedrock", "height": 1 },
                                { "block": "minecraft:grass_block", "height": 3 }
                            ]
                        }
                    }
                },
                "minecraft:the_end": { "load": "eager" }
            }
        }
    }
}
```

`load` is `lazy` by default, which builds a dimension the first time something enters it, so a
server nobody takes to the End never pays for it. A lazy dimension skips the spawn search and the
start-region generation an eager one does; the first traveler loads the chunks they arrive in.
`eager` builds it at startup instead, which moves that cost to the start and uses more memory
while the server runs. The Overworld of the world players join is always built at startup. A
player who logged out in a lazy dimension comes back there on the next login, and the server
builds it then if nobody has visited since the boot.

A `generator` may be any of four kinds. `minecraft:noise` is vanilla terrain and needs the Java
data from [section 1.3](#13-world-generation-data); `minecraft:flat`, `jsprismarine:void` (empty
chunks) and `minecraft:debug` (every block state on a grid) need none of it. Without that data,
only `minecraft:normal` and `minecraft:flat` exist as presets, each with the Overworld alone. A
`type` other than the vanilla three has to come from a datapack in the server's pack stack, such
as one listed under `content-datapacks`, and adding an id the preset lacks needs both `type` and
`generator`. Each `type` backs one dimension per world: two dimensions naming the same type stop
the server with an error.

A world remembers the dimensions it was generated with. Changing `preset` or a `generator` for
an existing world does nothing to its terrain: the server keeps the saved stems and logs one
line per dimension where the config disagrees. Start a new world folder for new terrain.

Older configs spelled the same thing as `generator: "Overworld"` or `generator: "Flat"`, with
flat layers under `layers` as `{ "block", "size" }`. The config schema no longer lists either
key, so an editor flags them, but the server still reads both: `Overworld` is
`preset: "minecraft:normal"`, `Flat` is `preset: "minecraft:flat"`, and `layers` becomes a
`minecraft:flat` generator for `minecraft:overworld` with each layer's `size` written as
`height`. It logs once per world that the keys are deprecated and writes the new spelling back
to the file, so you only see the message and the editor's marks until the next start. Any other
`generator` name stops the server with an error, as it did before.

### World seeds

Write a world's `seed` as a string, as the examples above do.

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
