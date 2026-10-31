# @jsprismarine/prismarine

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![Contributors](https://img.shields.io/github/contributors/JSPrismarine/JSPrismarine?color=%23E30B5D)](https://github.com/JSPrismarine/JSPrismarine/graphs/contributors)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/prismarine)](https://www.npmjs.com/package/@jsprismarine/prismarine)
[![Code Coverage](https://img.shields.io/codecov/c/github/JSPrismarine/JSPrismarine?token=WLXLSJOGN3&color=63A375)](https://codecov.io/gh/JSPrismarine/JSPrismarine)
[![TODOs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/todo)](https://github.com/JSPrismarine/JSPrismarine/search?q=todo)
[![FIXMEs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/fixme)](https://github.com/JSPrismarine/JSPrismarine/search?q=fixme)
[![GitHub Commit Activity](https://img.shields.io/github/commit-activity/m/JSPrismarine/JSPrismarine?color=%2387F4BC)](https://github.com/JSPrismarine/JSPrismarine/commits/master)

`@jsprismarine/prismarine` is the main package of the Prismarine project containing the core (& game logic) implementation of the server.

## Prerequisites

Before you begin, ensure you have met the following requirements:

* You have installed the latest version of Node.js and a package manager like npm, pnpm or bun.

## Installation

To install `@jsprismarine/prismarine`, use the following command:

```
pnpm install @jsprismarine/prismarine --save
```

## Worlds and dimensions

Each `worlds.<name>` entry in `config.json` is a `Level`: one save with one seed, clock, set of
game rules and weather, and one `World` per dimension. The dimensions come from a Java
`worldgen/world_preset` named by `preset`, with per-dimension overrides under `dimensions`. A
stem's generator is built by the `GeneratorFactories` registry, whose built-in kinds are
`minecraft:noise`, `minecraft:flat`, `jsprismarine:void` and `minecraft:debug`; register a
`{ kind, build(context) }` factory to add one. Portal travel between a level's worlds is the
`DimensionTravel` service, reached through `Server.getDimensionTravel()`, with the cancelable
`entityPortalEnter` and `playerChangeDimension` events. The guide is
[docs/data-driven/dimensions.md](../../docs/data-driven/dimensions.md).

## JSON Schemas

The server uses `config.json` for its settings.

Draft 7 schemas for the package's JSON configuration and data files are
included in the published package under `schemas/`. JSON object files receive
a `$schema` URL for the build that last wrote them. Package builds and release
executables use their exact version. Standalone nightly executables use the
`unstable` npm dist-tag, which resolves to the latest unstable package. The
files `ops.json` and `banned-players.json` contain arrays at the root and carry
their schema URL in a leading comment. These URLs use UNPKG, so standalone
server users do not need to install an npm package to access the schemas.

`Block.getJavaTags()` and `Item.getJavaTags()` expose Java datapack tag membership after the
content stack loads. `hasJavaTag(name)` checks one membership. Their `getTags()` and `hasTag(name)`
methods continue to expose Bedrock tags.
