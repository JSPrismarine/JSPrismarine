# ![JSPrismarine](https://github.com/JSPrismarine/JSPrismarine/assets/108444335/3169ac83-0427-402d-a76d-6c1bc215c583)

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![Contributors](https://img.shields.io/github/contributors/JSPrismarine/JSPrismarine?color=%23E30B5D)](https://github.com/JSPrismarine/JSPrismarine/graphs/contributors)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/prismarine)](https://www.npmjs.com/package/@jsprismarine/prismarine)
[![Code Coverage](https://img.shields.io/codecov/c/github/JSPrismarine/JSPrismarine?token=WLXLSJOGN3&color=63A375)](https://codecov.io/gh/JSPrismarine/JSPrismarine)
[![GitHub Commit Activity](https://img.shields.io/github/commit-activity/m/JSPrismarine/JSPrismarine?color=%2387F4BC)](https://github.com/JSPrismarine/JSPrismarine/commits/master)

JSPrismarine is a dedicated server for Minecraft: Bedrock Edition, written in TypeScript. Players join it with the ordinary Bedrock client, from Minecraft <!-- fact:minecraft.oldest -->1.26.50<!-- /fact --> through <!-- fact:minecraft.newest -->1.26.60<!-- /fact --> (protocols <!-- fact:protocol.list -->2225 and 2193<!-- /fact -->). It is not affiliated with Mojang.

What sets it apart is where the game comes from. Instead of hand-written classes for every block and mob, the server builds its content at startup from Mojang's own data: the Bedrock behavior pack for blocks, items and entities, and the Java Edition datapack and reports for loot, recipes, advancements, enchantments and world generation. When Mojang changes the data, the server follows. A [parity suite](https://jsprismarine.github.io/JSPrismarine/parity) checks the result against vanilla, behavior by behavior.

**[Read the documentation at jsprismarine.github.io/JSPrismarine](https://jsprismarine.github.io/JSPrismarine/)**

## What works today

JSPrismarine is at version <!-- fact:server.version -->0.18.0<!-- /fact --> and in active development, so expect gaps; the [parity tracker](https://jsprismarine.github.io/JSPrismarine/parity) lists what matches vanilla and what does not yet. Today a server:

- **Generates vanilla worlds.** The Overworld, the Nether and the End are built from Java Edition's world generation data, with biomes, caves, ores and many of Java's structures, in worker threads. Portals take players between them, and the End has its dragon fight.
- **Runs mobs from data.** Entities spawn by Bedrock's spawn rules and act through Bedrock's AI goals and Java's brains. Villagers trade and restock, and a player with Bad Omen can start a village raid.
- **Plays like survival.** Combat, damage and status effects, enchanting, eating, loot tables, crafting, furnaces and containers, redstone, flowing water and lava, and fire all run on the live world.
- **Speaks the commands.** <!-- fact:commands.registered -->56<!-- /fact --> vanilla commands are registered, from `/give` and `/teleport` to `/execute` and `/scoreboard`, and Java datapack functions run with tags, macros and `/schedule`.
- **Loads your packs.** Bedrock behavior packs and Java datapacks stack on top of the vanilla ones; see [Extending JSPrismarine](docs/guide/extending.md).
- **Has a real console.** A terminal UI shows the log, TPS, players and memory with command completion, and falls back to a plain console under Docker, systemd or a hosting panel.

The server is also <!-- fact:packages.count -->45<!-- /fact --> [npm packages](https://jsprismarine.github.io/JSPrismarine/packages) you can use on their own, among them the Bedrock protocol, RakNet, NBT, LevelDB worlds and a Molang evaluator.

## Run a server

Each release on GitHub is meant to ship the server as a single executable for Linux, macOS and Windows, with nothing else to install. **Right now those builds stop on first start** ([#2919](https://github.com/JSPrismarine/JSPrismarine/issues/2919)), and no stable release carries them yet, so run the server from source until that is fixed. [Run the prebuilt server](https://jsprismarine.github.io/JSPrismarine/guide/running#run-the-prebuilt-server) has the download and first-start details for when it is.

## Run from source

A checkout runs with `pnpm run dev`, which also rebuilds and restarts the server whenever you change a file, so it is the way to work on add-ons, plugins or the server itself. It needs [Node.js](https://nodejs.org) <!-- fact:node.minimum -->26.4.0<!-- /fact --> or newer, [pnpm](https://pnpm.io) <!-- fact:pnpm.minimum -->12<!-- /fact --> or newer and, for the default Overworld, a JDK 25 or newer. It runs on Linux, macOS and modern Windows (WSL2 recommended).

```bash
corepack enable
git clone https://github.com/JSPrismarine/JSPrismarine.git
cd JSPrismarine
pnpm install
pnpm run dev
```

The first `pnpm run dev` downloads Mojang's Java Edition server jar (<!-- fact:java.size -->62 MB<!-- /fact -->) to generate the world generation data, and the Bedrock Dedicated Server archive (about <!-- fact:bds.size -->95 MB<!-- /fact -->) for the vanilla behavior pack. Later runs reuse the cache and need no network. To run without Java, use a flat world; [Running JSPrismarine](docs/guide/running.md#run-from-source) explains both, and the console flags.

Players then add the server in Minecraft under **Servers → Add Server** with your machine's address and port <!-- fact:server.port -->19132<!-- /fact -->. [Joining a server](docs/guide/joining.md) covers versions, sign-in and what to try when a player cannot connect.

## FAQ

- **Is JSPrismarine for Bedrock Edition or Java Edition?**
  Bedrock Edition. It reads Java Edition's data for gameplay rules, but only Bedrock clients can join.
- **Which devices can players join from?**
  Any Bedrock client the server's protocols cover on Windows, Android or iOS. Consoles need third-party tools; see [Joining a server](docs/guide/joining.md).
- **Can I write plugins?**
  There is no plugin loader yet. Packs change content, and a program can embed the server through `@jsprismarine/prismarine` and listen to its events; see [Extending JSPrismarine](docs/guide/extending.md).
- **Why can't I join a server running on my own Windows PC?**
  Windows keeps the Minecraft app from reaching its own machine. [Joining a server](docs/guide/joining.md#when-you-cannot-connect) has the one-line fix.
- **Is it ready for a public server?**
  Not yet: there is no stable release, and some vanilla behavior is still missing. It is ready to try, to build on and to help with.

## Contributing

Bug reports, ideas and code are all welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to report a bug, set up a checkout, test a change and send it. Questions go to [Discord](https://discord.gg/kZZCDyCBbW) or a [GitHub issue](https://github.com/JSPrismarine/JSPrismarine/issues/new).

JSPrismarine is open source under the [MPL-2.0](LICENSE) license.
