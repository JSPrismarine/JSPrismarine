---
title: Extending JSPrismarine
description: Add content with behavior packs and datapacks, or change what the server does in code by embedding it.
group: Documents
category: Guides
---

# Extending JSPrismarine

There are two ways to change what a JSPrismarine server does, and most work needs only the first.

- **Packs change content.** Blocks, items, entities, loot, recipes, worldgen and commands come from
  Bedrock behavior packs and Java datapacks. A pack is data, so it needs no code and no build, and
  it survives server updates.
- **Code changes behavior.** For what data cannot express, embed the server in your own Node.js
  program through `@jsprismarine/prismarine`, listen to its events and call its services.

JSPrismarine has no plugin loader yet: there is no folder the server scans for code to run. A
"plugin" today is a program that starts the server itself, as in [Embed the server](#embed-the-server).

## Add packs

List the packs in `config.json` and restart the server:

<!-- fact:config.contentTable -->
| Setting               | What it does                                                                    |
| --------------------- | ------------------------------------------------------------------------------- |
| `content-strict`      | Whether a pack that reports an error stops the server instead of loading short. |
| `content-world-packs` | Extra behavior pack directories this world loads, after the vanilla ones.       |
| `content-datapacks`   | Java datapack directories this world loads, after the vanilla one.              |
<!-- /fact -->

```jsonc
{
    "content-world-packs": ["packs/my-mobs"],
    "content-datapacks": ["packs/gameplay-tweaks"]
}
```

Later packs override earlier ones, so your packs win over vanilla. [Using packs](../data-driven/using-packs.md)
explains which formats load, how conflicts resolve and how to read what the server made of a pack.
[Molang](../data-driven/molang.md), [Entities](../data-driven/entities.md) and
[Gameplay data](../data-driven/gameplay-data.md) cover what each kind of definition can do.

Run the server from a checkout with `pnpm run dev` while you write a pack: it restarts the server
whenever a loaded pack's files change. See [Run from source](running.md#run-from-source).

## Embed the server

`@jsprismarine/prismarine` is the whole server as a library. Your program builds a `Config` and a
`Logger`, starts a `Server`, and listens to its events. This is the same thing the `prismarine`
command does, minus the console.

```bash
pnpm add @jsprismarine/prismarine @jsprismarine/logger
```

```typescript
import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';

// Reads config.json in the working directory, and writes it with every default if it is missing.
const config = new Config();
const logger = new Logger(config.getLogLevel());
const server = new Server({ config, logger });

server.on('playerSpawn', (event) => {
    logger.info(`${event.getPlayer().getName()} spawned`);
});

server.on('chat', (event) => {
    logger.info(`chat: ${event.getChat().getMessage()}`);
});

await server.bootstrap();
```

`server.shutdown()` stops it and saves the worlds.

The server reads its game data the way the prebuilt server does: from
`node_modules/.cache/jsprismarine/` in the working directory. Point `JSP_VANILLA_BEHAVIOR_PACK`,
`JSP_VANILLA_DATAPACK` and `JSP_JAVA_REPORTS` at copies made by a checkout, or run a
`minecraft:flat` world, which needs no Java data. [Running JSPrismarine](running.md) has the details.

### Events

`server.on(name, listener)` takes one of these <!-- fact:events.count -->18<!-- /fact --> events.
Calling `event.preventDefault()` cancels an event where the server checks for it, such as a player's
move or a trip through a portal.

<!-- fact:events.table -->
| Event                      | Listener receives               |
| -------------------------- | ------------------------------- |
| `chat`                     | `ChatEvent`                     |
| `tick`                     | `TickEvent`                     |
| `entityDamage`             | `EntityDamageEvent`             |
| `entityDeath`              | `EntityDeathEvent`              |
| `entityPortalEnter`        | `EntityPortalEnterEvent`        |
| `playerChangeDimension`    | `PlayerChangeDimensionEvent`    |
| `playerConnect`            | `PlayerConnectEvent`            |
| `playerDisconnect`         | `PlayerDisconnectEvent`         |
| `playerSpawn`              | `PlayerSpawnEvent`              |
| `playerDespawn`            | `PlayerDespawnEvent`            |
| `playerMove`               | `PlayerMoveEvent`               |
| `playerToggleFlight`       | `PlayerToggleFlightEvent`       |
| `playerToggleSprint`       | `PlayerToggleSprintEvent`       |
| `playerToggleOperator`     | `PlayerToggleOperatorEvent`     |
| `playerSetGamemode`        | `PlayerSetGamemodeEvent`        |
| `raknetConnect`            | `RaknetConnectEvent`            |
| `raknetDisconnect`         | `RaknetDisconnectEvent`         |
| `raknetEncapsulatedPacket` | `RaknetEncapsulatedPacketEvent` |
<!-- /fact -->

The [API reference](https://jsprismarine.dev/api/) documents every class the
events hand you, and every other export of the
[published packages](https://jsprismarine.dev/packages).

## Use the pieces on their own

Every package is published on its own, so a tool can take one without the server: read worlds with
`@jsprismarine/leveldb`, parse NBT with `@jsprismarine/nbt`, evaluate Molang with
`@jsprismarine/molang`, or speak the protocol with `@jsprismarine/protocol` over
`@jsprismarine/raknet` or `@jsprismarine/nethernet`.
