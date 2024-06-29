# @jsprismarine/brigadier

[![License](https://img.shields.io/badge/license-MIT-orange
)](https://github.com/JSPrismarine/JSPrismarine/blob/master/packages/brigadier/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![Contributors](https://img.shields.io/github/contributors/JSPrismarine/JSPrismarine?color=%23E30B5D)](https://github.com/JSPrismarine/JSPrismarine/graphs/contributors)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/brigadier)](https://www.npmjs.com/package/@jsprismarine/brigadier)
[![Code Coverage](https://img.shields.io/codecov/c/github/JSPrismarine/JSPrismarine?token=WLXLSJOGN3&color=63A375)](https://codecov.io/gh/JSPrismarine/JSPrismarine)
[![TODOs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/todo)](https://github.com/JSPrismarine/JSPrismarine/search?q=todo)
[![FIXMEs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/fixme)](https://github.com/JSPrismarine/JSPrismarine/search?q=fixme)
[![GitHub Commit Activity](https://img.shields.io/github/commit-activity/m/JSPrismarine/JSPrismarine?color=%2387F4BC)](https://github.com/JSPrismarine/JSPrismarine/commits/master)


`@jsprismarine/brigadier is a Node.js` version of Mojang's Brigadier library. It is a command parser & dispatcher, originally designed and developed for Minecraft: Java Edition and now freely available for use elsewhere under the MIT license.

This project was originally developed by [remtori](https://github.com/remtori) as [node-brigadier](https://github.com/remtori/brigadier).

## Prerequisites

Before you begin, ensure you have met the following requirements:

* You have installed the latest version of Node.js and a package manager like npm, pnpm or bun.

## Installation

To install `@jsprismarine/brigadier`, use the following command:

```
pnpm install @jsprismarine/brigadier --save
```

## Usage

### Dispatch a command

```typescript
import { CommandDispatcher, literal, argument, string, Suggestions } from '@jsprismarine/brigadier';

// Define a BlockPos class
class BlockPos {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    parse(reader) {
        this.x = reader.readInt();
        reader.skip();
        this.y = reader.readInt();
        reader.skip();
        this.z = reader.readInt();
        return this;
    }
    listSuggestions(context, builder) {
        return Suggestions.empty();
    }
    getExamples() {
        return ['1 2 3'];
    }
}

// Create a new CommandDispatcher
const dispatcher = new CommandDispatcher();

// Register a command
dispatcher.register(
    literal('fill').then(
        argument('pos1', new BlockPos()).then(
            argument('pos2', new BlockPos()).then(
                argument('block', string()).executes((context) => {
                    console.log(context.getArgument('pos1', BlockPos));
                    console.log(context.getArgument('pos2', BlockPos));
                    console.log(context.getArgument('block', 3));
                    return 0;
                })
            )
        )
    )
);

// Parse a command
const parsedCommand = dispatcher.parse('fill 3 4 5 10 11 12 air', {});

// Execute the command
try {
    dispatcher.execute(parsedCommand);
} catch (error) {
    console.error(error.getMessage());
}
```
