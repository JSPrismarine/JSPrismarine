---
title: Error reference
description: What each error JSPrismarine throws means, listed by the package that throws it.
group: Documents
category: Errors
---

# Error reference

Every error JSPrismarine throws has a code and an entry in this reference. When the server logs an
error, the last line names its code and links to the entry:

<!-- fact:errors.example.reference -->
```text
More about PRISMARINE_PLAYER_NOT_FOUND: https://jsprismarine.dev/errors/prismarine#prismarine-player-not-found
```
<!-- /fact -->

Code that embeds the server or uses a package on its own reads the same two values from the error
it catches, as `error.code` and `error.docs`.

There are <!-- fact:errors.count -->1352<!-- /fact --> errors, one page per package:

<!-- fact:errors.domains -->
| Package                                                 | Errors |
| ------------------------------------------------------- | ------ |
| [`@jsprismarine/addon-tools`](addon-tools.md)           | 14     |
| [`@jsprismarine/auth`](auth.md)                         | 25     |
| [`@jsprismarine/binaryutils`](binaryutils.md)           | 6      |
| [`@jsprismarine/block-behaviors`](block-behaviors.md)   | 1      |
| [`@jsprismarine/blocks`](blocks.md)                     | 15     |
| [`@jsprismarine/brigadier`](brigadier.md)               | 7      |
| [`@jsprismarine/chunkgen`](chunkgen.md)                 | 33     |
| [`@jsprismarine/client`](client.md)                     | 36     |
| [`@jsprismarine/commands`](commands.md)                 | 26     |
| [`@jsprismarine/errors`](common.md)                     | 1      |
| [`@jsprismarine/console-protocol`](console-protocol.md) | 1      |
| [`@jsprismarine/console`](console.md)                   | 17     |
| [`@jsprismarine/content`](content.md)                   | 15     |
| [`@jsprismarine/engine-systems`](engine-systems.md)     | 1      |
| [`@jsprismarine/entities`](entities.md)                 | 1      |
| [`@jsprismarine/entity-brains`](entity-brains.md)       | 5      |
| [`@jsprismarine/entity-goals`](entity-goals.md)         | 1      |
| [`@jsprismarine/features`](features.md)                 | 53     |
| [`@jsprismarine/items`](items.md)                       | 5      |
| [`@jsprismarine/kernel`](kernel.md)                     | 13     |
| [`@jsprismarine/leveldb`](leveldb.md)                   | 69     |
| [`@jsprismarine/lighting`](lighting.md)                 | 4      |
| [`@jsprismarine/loot`](loot.md)                         | 6      |
| [`@jsprismarine/mapping`](mapping.md)                   | 1      |
| [`@jsprismarine/minecraft`](minecraft.md)               | 1      |
| [`@jsprismarine/molang`](molang.md)                     | 11     |
| [`@jsprismarine/native-network`](native-network.md)     | 17     |
| [`@jsprismarine/nbt`](nbt.md)                           | 29     |
| [`@jsprismarine/nethernet`](nethernet.md)               | 42     |
| [`@jsprismarine/packs`](packs.md)                       | 38     |
| [`@jsprismarine/predicates`](predicates.md)             | 2      |
| [`@jsprismarine/prismarine`](prismarine.md)             | 413    |
| [`@jsprismarine/protocol`](protocol.md)                 | 132    |
| [`@jsprismarine/raknet`](raknet.md)                     | 29     |
| [`@jsprismarine/script-host`](script-host.md)           | 97     |
| [`@jsprismarine/server`](server.md)                     | 23     |
| [`@jsprismarine/structures`](structures.md)             | 43     |
| [`@jsprismarine/worldgen`](worldgen.md)                 | 119    |
<!-- /fact -->

## Reading an entry

An entry's heading is the error's code, such as <!-- fact:errors.example.code -->`PRISMARINE_PLAYER_NOT_FOUND`<!-- /fact -->. Below it is the message,
with each value the error fills in written as a name in braces: the message
<!-- fact:errors.example.template -->`Player "{username}" not found.`<!-- /fact --> reaches the log as <!-- fact:errors.example.message -->`Player "Steve" not found.`<!-- /fact -->.

Next comes the class to catch the error by. Most errors extend `Error`, `TypeError` or
`RangeError`, as the code threw before the reference existed. Some extend a group class instead,
such as `CorruptionError` in `@jsprismarine/leveldb`, so one `instanceof` check catches every error
of that kind. A package's page lists its groups first. When the code explains what causes an error
and what to do about it, that explanation follows.

## Adding an error

The errors live in `@jsprismarine/errors`, one catalog per package, and code throws them from
there. Its README explains how to add one, and the lint fails on a `new Error(...)` anywhere else.
