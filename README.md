# ![JSPrismarine](https://github.com/JSPrismarine/JSPrismarine/assets/108444335/3169ac83-0427-402d-a76d-6c1bc215c583)

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![Contributors](https://img.shields.io/github/contributors/JSPrismarine/JSPrismarine?color=%23E30B5D)](https://github.com/JSPrismarine/JSPrismarine/graphs/contributors)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/prismarine)](https://www.npmjs.com/package/@jsprismarine/prismarine)
[![Code Coverage](https://img.shields.io/codecov/c/github/JSPrismarine/JSPrismarine?token=WLXLSJOGN3&color=63A375)](https://codecov.io/gh/JSPrismarine/JSPrismarine)
[![TODOs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/todo?label=todos)](https://github.com/JSPrismarine/JSPrismarine/search?q=todo)
[![FIXMEs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/fixme?label=fixmes)](https://github.com/JSPrismarine/JSPrismarine/search?q=fixme)
[![GitHub Commit Activity](https://img.shields.io/github/commit-activity/m/JSPrismarine/JSPrismarine?color=%2387F4BC)](https://github.com/JSPrismarine/JSPrismarine/commits/master)

JSPrismarine is a dedicated Minecraft Bedrock Edition server written in TypeScript. It focuses on performance, extensibility, and ease-of-use. It is not affiliated with the official server software from Mojang AB.

## Why use JSPrismarine?

- **Vanilla behavior from data.** Blocks, items, entities, loot, recipes and worldgen come from Mojang's own Bedrock and Java data rather than from hand-written tables, so the server follows the game.
- **Parity you can check.** A parity suite compares the server with vanilla, and the [parity tracker](https://jsprismarine.github.io/JSPrismarine/parity) shows what matches and what does not.
- **One file to host.** The prebuilt server runs on Linux, macOS and Windows with nothing else to install.
- **Packages you can reuse.** The protocol, RakNet, NBT, LevelDB, Molang and the rest are published to npm on their own.
- **Open source** under the [MPL-2.0](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE) license.

## Getting started

**[You can find the documentation over at jsprismarine.github.io/JSPrismarine](https://jsprismarine.github.io/JSPrismarine/).**

### Run a server

Download the prebuilt server for your platform from the [releases](https://github.com/JSPrismarine/JSPrismarine/releases?q=jsprismarine%40&expanded=true) and run it. It is one file with everything inside: you need no Node.js, pnpm, Java or checkout of this repository. Releases tagged `jsprismarine@<version>` carry the executables for Linux, macOS and Windows; the ones marked _Pre-release_ are nightly builds of `master`, which may or may not work before reaching `v1.0.0`.

```bash
chmod +x prismarine-linux-x64
./prismarine-linux-x64
```

The first start downloads the vanilla behavior pack from Mojang (about <!-- fact:bds.size -->95 MB<!-- /fact -->) and unpacks the server's data next to it; later starts need no network. See [Run the prebuilt server](https://jsprismarine.github.io/JSPrismarine/guide/running#run-the-prebuilt-server) for every platform's file, the macOS and Windows download prompts, and updating.

### Develop add-ons, plugins or JSPrismarine itself

Run a checkout with `pnpm run dev`, which rebuilds and restarts the server when you change a file. It needs [Node.js](https://nodejs.org) <!-- fact:node.minimum -->26.4.0<!-- /fact --> or newer, [pnpm](https://pnpm.io) <!-- fact:pnpm.minimum -->12<!-- /fact --> or newer and, for the default overworld, a JDK 25 or newer. It runs on Linux, macOS, other Unix-based systems, and modern Windows (WSL2 recommended).

```bash
corepack enable
git clone https://github.com/JSPrismarine/JSPrismarine.git
cd JSPrismarine
pnpm install
pnpm run dev
```

In an interactive terminal on Node 26.9 or newer, the console UI opens by default; Node versions 26.4 through 26.8 also support it with `--experimental-ffi`. In other environments, the server reads commands from stdin and writes log lines to stdout. Pass `--no-tui` or set `JSP_NO_TUI=1` to force the plain console. See [Running JSPrismarine](docs/guide/running.md#4-console).

> [!NOTE]
> The build needs the Bedrock resources, a pinned download `pnpm install` fetches for you. Building for the first time needs a network connection; after that the download is cached. To work offline from a cold start, point `JSP_CLOUDBURST_DATA_PATH` at a local [CloudburstMC/Data](https://github.com/CloudburstMC/Data) checkout.

> [!NOTE]
> The first `pnpm run dev` also fetches Mojang's Java Edition world generation data, which the default overworld is built from; that takes a <!-- fact:java.size -->62 MB<!-- /fact --> download, a couple of minutes and a JDK 25 or newer. Later runs reuse the cache and need no network. See [World generation data](docs/guide/running.md#13-world-generation-data) for how to point it at your own copy, or how to run a flat world with no Java at all.

## FAQ

- Can I contribute?
  - Sure, make sure to read the [CONTRIBUTING.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/CONTRIBUTING.md) file first.
- Is JSPrismarine for `Minecraft: Bedrock Edition` or `Minecraft: Java Edition`?
  - JSPrismarine is made for `Minecraft: Bedrock Edition`.
- What devices can a player join JSPrismarine with?
  - Any Minecraft: Bedrock Edition client on Windows, Android or iOS that the server's protocols cover. Consoles need third-party tools. See [Joining a server](docs/guide/joining.md).
- Which OSes can run JSPrismarine?
  - The prebuilt server runs on Linux (x64 and ARM64, glibc or musl), macOS (Apple silicon and Intel) and Windows (x64 and ARM64). From source, any platform with Node.js <!-- fact:node.minimum -->26.4.0<!-- /fact --> or newer.
- Can I write plugins?
  - There is no plugin loader yet. Packs change content, and code can embed the server; see [Extending JSPrismarine](docs/guide/extending.md).
- Why can't I join a JSPrismarine instance hosted on my Windows PC?
  - Windows keeps the Minecraft app from reaching its own machine. [Joining a server](docs/guide/joining.md#when-you-cannot-connect) has the one-line fix.
- If my question isn't listed here, where should I ask?
  - You can join the [Discord server](https://discord.gg/kZZCDyCBbW), or open a [GitHub issue](https://github.com/JSPrismarine/JSPrismarine/issues/new) for development-related questions.

## Documentation

- [Docs](https://jsprismarine.github.io/JSPrismarine/).
- [Running JSPrismarine](https://jsprismarine.github.io/JSPrismarine/guide/running).

## Remarks

- JSPrismarine is still in early/active development, and no stable versions have been released yet.
