# @jsprismarine/bedrock-data

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/bedrock-data)](https://www.npmjs.com/package/@jsprismarine/bedrock-data)

Minecraft Bedrock game data exported in a nodejs friendly way.

## Where the data comes from

- `src/jsp/` is captured from a Bedrock Dedicated Server 1.26.51.1 by
  `packages/client/tools/capture-server-data.mjs`. The item table and the three payloads a client
  refuses to join without live here.
- `src/resources/` is a Git submodule, [CloudburstMC/Data](https://github.com/CloudburstMC/Data),
  pinned to the commit that dumped 1.26.50. `utils/build.js` reads the creative menu, the actor
  identifiers, and the two item columns the capture does not record: each item's version and
  its component NBT.
- `src/vendor/` is data neither of the two carries, copied from projects that do. See
  [its README](src/vendor/README.md) for the source and license of each file.

## Installation

To install `@jsprismarine/bedrock-data`, use the following command:

```
pnpm install @jsprismarine/bedrock-data --save
```
