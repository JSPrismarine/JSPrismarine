# ![JSPrismarine](https://github.com/JSPrismarine/JSPrismarine/assets/108444335/3169ac83-0427-402d-a76d-6c1bc215c583)

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![Contributors](https://img.shields.io/github/contributors/JSPrismarine/JSPrismarine?color=%23E30B5D)](https://github.com/JSPrismarine/JSPrismarine/graphs/contributors)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/prismarine)](https://www.npmjs.com/package/@jsprismarine/prismarine)
[![Code Coverage](https://img.shields.io/codecov/c/github/JSPrismarine/JSPrismarine?token=WLXLSJOGN3&color=63A375)](https://codecov.io/gh/JSPrismarine/JSPrismarine)
[![GitHub Commit Activity](https://img.shields.io/github/commit-activity/m/JSPrismarine/JSPrismarine?color=%2387F4BC)](https://github.com/JSPrismarine/JSPrismarine/commits/master)

**A Minecraft: Bedrock Edition server built to play like vanilla, by running on Mojang's own data.**

JSPrismarine builds its blocks, items, mobs, loot, recipes and world generation at startup from the Bedrock behavior pack and Java Edition's datapack, instead of re-implementing them by hand. When the game changes, the server follows. Players join with the normal Bedrock client.

- **Real vanilla worlds.** The Overworld, Nether and End, generated from Java's world generation data, with portals and the dragon fight.
- **Living mobs.** Bedrock spawn rules, AI goals and Java brains. Villagers trade, and raids come for your village.
- **Survival systems.** Combat, effects, enchanting, crafting, furnaces, redstone, flowing water and fire.
- **Vanilla commands** and Java datapack functions, plus your own Bedrock packs and datapacks on top.
- **Parity you can check.** A test suite compares the server with vanilla, and the [parity tracker](https://jsprismarine.dev/parity) shows what matches and what doesn't yet.

JSPrismarine is in active development, so some vanilla behavior is still missing. Try it, and tell us what you find.

## Try it

The quickest look is the demo server. In Minecraft, open **Servers → Add Server** and enter <!-- fact:demo.address -->`demo.jsprismarine.dev`<!-- /fact --> with port <!-- fact:demo.port -->19132<!-- /fact -->. No setup, and you see what works today. Xbox, PlayStation and Switch have no **Add Server**, and the [joining guide](docs/guide/joining.md#when-you-cannot-connect) explains what joining from them takes.

<!-- fact:demo.sponsor -->RespawnHost<!-- /fact --> provides part of the demo server's hosting. Rent a server of your own at <!-- fact:demo.sponsorLink -->[rspwn.click/jsprismarine](https://rspwn.click/jsprismarine)<!-- /fact --> for <!-- fact:demo.discount -->15%<!-- /fact --> off, and you help pay for our test servers.

### Run your own

You need [Node.js](https://nodejs.org), [pnpm](https://pnpm.io/installation) and a JDK; [Running JSPrismarine](https://jsprismarine.dev/guide/running#run-from-source) lists the versions.

```bash
git clone https://github.com/JSPrismarine/JSPrismarine.git
cd JSPrismarine
pnpm install
pnpm run dev
```

The first run downloads Mojang's game data once. Then add the server in Minecraft under **Servers → Add Server**.

## Learn more

- [Documentation](https://jsprismarine.dev/): running, configuring and hosting a server
- [Joining a server](docs/guide/joining.md): for players, including the Windows loopback fix
- [Extending JSPrismarine](docs/guide/extending.md): packs, and embedding the server in your own code
- [Packages](https://jsprismarine.dev/packages): the protocol, RakNet, NBT, LevelDB, Molang and the rest, each on npm

## Get involved

Join us on [Discord](https://discord.gg/kZZCDyCBbW), [open an issue](https://github.com/JSPrismarine/JSPrismarine/issues/new), or read [CONTRIBUTING.md](CONTRIBUTING.md) to send a change. JSPrismarine is open source under the [MPL-2.0](LICENSE) license and not affiliated with Mojang.
