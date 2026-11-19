---
title: Extending JSPrismarine
description: Run Bedrock behavior pack scripts, add content with packs, or embed the server in your own Node.js program.
group: Documents
category: Guides
---

# Extending JSPrismarine

Script packs are JSPrismarine's plugin format. A script pack is an ordinary Bedrock behavior pack
whose scripts use Minecraft's Script API, `@minecraft/server` and the modules beside it, the same
API that Bedrock Dedicated Server (BDS) runs. A pack written for BDS loads on JSPrismarine without
edits, and a pack written on JSPrismarine runs on BDS too, as long as it checks for
JSPrismarine-only features before it uses them.

There are three ways to change what a server does, from the most portable to the most powerful:

- **Script packs change behavior.** Scripts subscribe to events, run commands, show forms and
  read or change the world. See [Script packs](#script-packs).
- **Packs without scripts change content.** Blocks, items, entities, loot, recipes, worldgen and
  commands come from Bedrock behavior packs and Java datapacks. They are data, so they need no code
  and no build. See [Add content with packs](#add-content-with-packs).
- **Embedding changes anything.** For what neither kind of pack can express, start the server from
  your own Node.js program through `@jsprismarine/prismarine`, listen to its events and call its
  services. See [Embed the server](#embed-the-server).

## Script packs

### Before you start

The script host, the part of JSPrismarine that runs scripts, is a native library. It isn't
published to npm yet, and it builds only on <!-- fact:scripting.buildPlatforms -->macOS on Apple silicon, Linux on arm64 with glibc, Linux on arm64 with musl, Linux on x64 with glibc, Linux on x64 with musl and Windows on x64<!-- /fact -->
for now, so scripts run only on a server you run from source
([Run from source](running.md#run-from-source)). Build the library once in your checkout:

```bash
pnpm --filter @jsprismarine/script-host run build:native
```

The build needs a C compiler (`cc`, or the one `CC` names), `tar` that reads `.tar.xz`, and `git`.
It downloads the pinned QuickJS release into the checkout's cache.

A server without the library still loads every pack. It runs their content, skips their scripts,
and logs a warning that says how many packs have scripts and why they don't run. Prebuilt libraries
for every platform are tracked in [#3215](https://github.com/JSPrismarine/JSPrismarine/issues/3215).

### Install a script pack

A script pack is a folder with a `manifest.json` that has a `script` module, and the scripts that
module names. This manifest declares an entry script and the `@minecraft/server` module it imports:

```json
{
    "format_version": 2,
    "header": {
        "name": "Welcome",
        "description": "Greets players when they join.",
        "uuid": "6a7c1d0e-0b47-4a43-9a0e-2f5f6f0b7c11",
        "version": [1, 0, 0],
        "min_engine_version": [1, 21, 0]
    },
    "modules": [
        {
            "type": "script",
            "language": "javascript",
            "uuid": "e3a2f4b8-5d1c-4f9e-8b6a-7c0d9e2f1a34",
            "version": [1, 0, 0],
            "entry": "scripts/main.js"
        }
    ],
    "dependencies": [{ "module_name": "@minecraft/server", "version": "2.0.0" }]
}
```

```js
// scripts/main.js
import { world } from '@minecraft/server';

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (initialSpawn) world.sendMessage(`Welcome, ${player.name}`);
});
```

To install it:

1. Put the pack folder anywhere on the server's machine, and list it under `content-world-packs` in
   `config.json`:

    ```json
    {
        "content-world-packs": ["packs/welcome"]
    }
    ```

2. If the pack comes from a BDS server, copy that server's `config/` folder too, and put it beside
   `config.json`. JSPrismarine reads it as BDS does: `config/default/permissions.json` lists the
   modules every pack may use, and `config/<script module uuid>/` holds one pack's own
   `permissions.json`, `variables.json` and `secrets.json`. Without the folder, the server allows
   the modules a fresh BDS allows.
3. If the pack declares a beta version, such as `@minecraft/server`
   <!-- fact:scripting.serverBeta -->2.12.0-beta<!-- /fact -->, turn on the Beta APIs experiment:
   add <!-- fact:world.betaApis -->`gametest`<!-- /fact --> to the `experiments` list of the
   world's `worlds.<name>` entry ([The config shape](../data-driven/dimensions.md#the-config-shape)).
4. Start the server. For each pack, it logs how much of the Script API the pack's scripts use is
   implemented (see [What is not implemented yet](#what-is-not-implemented-yet)).

Only the world that `level-name` names runs scripts. Its packs share one script engine, and each
pack gets a JavaScript context of its own, so two packs never share a `globalThis`.

`/reload` on the console runs every pack again from the top, as on BDS. `pnpm run dev` sends it
for you whenever a script in a loaded pack changes, so a script edit takes effect without a
restart. A change to any other pack file still restarts the server.

### Modules and versions

Each row is a module a pack can declare in its `dependencies`, with the versions this server
serves. The server generates every module from the metadata in Mojang's `bedrock-samples`
<!-- fact:samples.tag -->v1.26.60.5<!-- /fact -->, and serves the versions the pinned BDS
<!-- fact:bds.version -->1.26.60.6<!-- /fact --> serves.

<!-- fact:scripting.modules.table -->
| Module                       | Stable versions served       | Beta served   | Allowed without `permissions.json` |
| ---------------------------- | ---------------------------- | ------------- | ---------------------------------- |
| `@minecraft/common`          | 1.x: `1.3.0`                 | none          | no                                 |
| `@minecraft/debug-utilities` | none                         | `1.0.0-beta`  | yes                                |
| `@minecraft/diagnostics`     | none                         | `1.0.0-beta`  | no                                 |
| `@minecraft/server`          | 1.x: `1.19.0`, 2.x: `2.11.0` | `2.12.0-beta` | yes                                |
| `@minecraft/server-admin`    | none                         | `1.0.0-beta`  | yes                                |
| `@minecraft/server-gametest` | none                         | `1.0.0-beta`  | yes                                |
| `@minecraft/server-graphics` | 1.x: `1.0.0`                 | `1.1.0-beta`  | no                                 |
| `@minecraft/server-net`      | none                         | `1.0.0-beta`  | no                                 |
| `@minecraft/server-ui`       | 1.x: `1.3.0`, 2.x: `2.3.0`   | `2.4.0-beta`  | yes                                |
<!-- /fact -->

The server picks versions the way BDS does:

- A stable version gets the newest stable minor of its major version, so a pack's dependency on
  `@minecraft/server` <!-- fact:scripting.resolveExample -->version `2.0.0` gets `2.11.0`<!-- /fact -->.
  A version newer than that, or a major version the table doesn't list, is refused.
- A beta version needs the world's Beta APIs experiment, and loads only when it is the one beta in
  the table. The word `beta` in place of a version names that one. Beta versions don't follow
  semantic versioning, so an older or newer beta is refused, as BDS refuses it.
- A module the world's `permissions.json` doesn't allow is refused. The last column says which
  modules a server without a `config/` folder allows. To use another one, such as
  `@minecraft/server-net`, add it to `allowed_modules` in `config/default/permissions.json`.

A refused module stops the pack from loading. The server logs the same content log message BDS
does, and for a version it doesn't serve, that message lists the versions it does.

### What is not implemented yet

Every module, class and member in the table's versions exists, so a script that tests for a member
with `typeof` or `in` sees what it would see on BDS. Not every member has behavior yet. Calling
one that doesn't throws an `Error` named `NotImplementedError`, whose message names the member and
its module: `<Class>.<member> from <module> is not implemented`. The content log also names it,
once per pack.

To see what your pack needs before it runs into one, read the lines the server logs when the pack
loads:

```text
[Scripting] [<pack>] uses <n> Script API members, <n> of them implemented (<module> <version>: <n> of <n>)
[Scripting] [<pack>] not implemented yet: <member>, <member>, ...
```

The first line counts the members your scripts name, and how many members of each module version
have behavior. The second lists the members your scripts name that don't, and is left out when
there are none. The scan reads the script text, so a member reached in a way the text doesn't
show, such as through a computed property name, isn't counted.

Where JSPrismarine's behavior differs from BDS's, the `scripting` rows of the
[parity dashboard](https://jsprismarine.dev/parity) say so. Each scenario there runs one pack on
JSPrismarine and compares what its scripts saw with a capture of the same pack on the pinned BDS. [The script host
plan](../plans/script-api-host.md) records which members each stage added and the gaps it left.

### How scripts run

JSPrismarine runs each tick's scripts at the end of that tick, in the order BDS runs them, and
before-events such as `world.beforeEvents.chatSend` run while the action they can cancel happens.
The engine is QuickJS, as on BDS, and offers what BDS's engine offers: there is no `eval`, a
`Function` cannot be built from a string, and newer built-ins that BDS lacks, such as iterator
helpers, are missing.

A JSPrismarine server can replay a recorded session and reach the same state
([ADR 0006](../adr/0006-replay-determinism-contract.md)), and scripts take part in that. So
anything a script could read from the machine it runs on is fixed or recorded
([ADR 0021](../adr/0021-the-script-watchdog-counts-steps.md)). A pack written for BDS needs no
changes for this, but a few things behave differently from BDS:

- **The watchdog counts work, not time.** A script that runs too long is stopped after a number of
  steps, where a step is a fixed amount of interpreter work, so the same script stops at the same
  point on every machine. `script-watchdog-hang-threshold` keeps BDS's name and unit, and each
  millisecond of it allows <!-- fact:scripting.stepsPerMillisecond -->10<!-- /fact --> steps, for
  each callback and for all the scripts of one tick. That ratio is a starting value, not a
  measurement, so a script BDS lets finish may stop on JSPrismarine, or the reverse
  ([#3228](https://github.com/JSPrismarine/JSPrismarine/issues/3228)). As on BDS, a hang, a stack
  overflow (even one the script catches) and going over `script-watchdog-memory-limit` shut the
  server down unless `script-watchdog-enable-shutdown` is `false`, and a beta pack can cancel the
  shutdown for a hang or a stack overflow in `system.beforeEvents.watchdogTerminate`.
  [Every setting](running.md#every-setting) describes the three settings.
- **`Math.random` is seeded from the world's seed.** Each pack draws its own sequence, and the
  sequence starts over whenever the scripts load, so it repeats on every restart and every
  `/reload`. Don't use it for anything that must differ between runs, such as identifiers you
  store in dynamic properties.
- **The clock moves once per tick.** `Date.now()`, `new Date()` and `Date()` return the time the
  tick started, the same value for every call in that tick. Measure work in ticks with
  `system.currentTick` rather than by subtracting two dates.
- **Debug shapes count down in ticks.** A shape drawn with `@minecraft/debug-utilities` loses 0.05
  seconds of its `timeLeft` each tick. BDS takes off the time each frame took, so how many ticks a
  shape lasts there depends on the server's load. On JSPrismarine it lasts the same number of ticks
  every time.
- **HTTP results arrive in a later tick.** A request from `@minecraft/server-net` runs off the
  tick, and its promise settles in a later tick's script flush, never in the tick that sent it. A
  replay settles it with the recorded result instead of the network.

A replay doesn't write the clock or the HTTP results it admitted to its trace file yet, so a replay
from that file can still differ where a script reads them
([#3226](https://github.com/JSPrismarine/JSPrismarine/issues/3226)).

### Debugging

Support for the Minecraft Bedrock Debugger for VS Code is in progress and has not been checked
against VS Code yet. [The script host plan](../plans/script-api-host.md) tracks it.

### Use JSPrismarine-only features

A pack can import `@jsprismarine/server` to read what only JSPrismarine offers, such as which
server and version it runs on. Leave the module out of the manifest and load it with `import()`
inside `try`, and the same pack still loads on BDS, where the import rejects.
[The JSPrismarine script module](jsprismarine-module.md) shows the pattern and lists every member.

## Add content with packs

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
import { Server } from '@jsprismarine/prismarine';
import { Config } from '@jsprismarine/prismarine/config/Config';

// Reads config.json in the working directory, and writes it with every default if it is missing.
const config = new Config();
const logger = new Logger(config.getLogLevel());
const server = new Server({ config, logger });

server.on('playerSpawn', (event) => {
    logger.info(`${event.getIdentity().name} spawned`);
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

An embedded server runs script packs the same way, with the script host as an optional
dependency. Until the script host is on npm, a server installed from npm loads script packs
without their scripts, as [Before you start](#before-you-start) describes.

### Entry points

The package publishes <!-- fact:prismarine.entryPoints.count -->45<!-- /fact --> entry points, and
each one is the module that defines what it exports. The root exports `Server` and nothing else.
Import every other symbol from its own module, such as `Config` from
`@jsprismarine/prismarine/config/Config`. Each event class and `PlayerSession` is the default
export of its module. A path that is not in this list does not resolve:

<!-- fact:prismarine.entryPoints.list -->
```text
@jsprismarine/prismarine
@jsprismarine/prismarine/chat/Chat
@jsprismarine/prismarine/command/vanillaCommands
@jsprismarine/prismarine/config/Config
@jsprismarine/prismarine/console/RemoteConsole
@jsprismarine/prismarine/console/RemoteLogTransport
@jsprismarine/prismarine/content/packStack
@jsprismarine/prismarine/content/settings
@jsprismarine/prismarine/entity/playerAbilities
@jsprismarine/prismarine/events/chat/ChatEvent
@jsprismarine/prismarine/events/entity/EntityDamageEvent
@jsprismarine/prismarine/events/entity/EntityDeathEvent
@jsprismarine/prismarine/events/entity/EntityPortalEnterEvent
@jsprismarine/prismarine/events/Event
@jsprismarine/prismarine/events/other/TickEvent
@jsprismarine/prismarine/events/player/PlayerChangeDimensionEvent
@jsprismarine/prismarine/events/player/PlayerConnectEvent
@jsprismarine/prismarine/events/player/PlayerDespawnEvent
@jsprismarine/prismarine/events/player/PlayerDisconnectEvent
@jsprismarine/prismarine/events/player/PlayerEvent
@jsprismarine/prismarine/events/player/PlayerMoveEvent
@jsprismarine/prismarine/events/player/PlayerSetGamemodeEvent
@jsprismarine/prismarine/events/player/PlayerSpawnEvent
@jsprismarine/prismarine/events/player/PlayerToggleFlightEvent
@jsprismarine/prismarine/events/player/PlayerToggleOperatorEvent
@jsprismarine/prismarine/events/player/PlayerToggleSprintEvent
@jsprismarine/prismarine/events/raknet/RaknetConnectEvent
@jsprismarine/prismarine/events/raknet/RaknetDisconnectEvent
@jsprismarine/prismarine/events/raknet/RaknetEncapsulatedPacketEvent
@jsprismarine/prismarine/events/ServerEvents
@jsprismarine/prismarine/modules/tokens
@jsprismarine/prismarine/network/InboundPacketTrace
@jsprismarine/prismarine/network/OutboundPacketTrace
@jsprismarine/prismarine/network/PlayerSession
@jsprismarine/prismarine/network/ReplayManifest
@jsprismarine/prismarine/about
@jsprismarine/prismarine/version
@jsprismarine/prismarine/world/GeneratorFactories
@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator
@jsprismarine/prismarine/world/generators/datadriven/SharedTerrainTileStore
@jsprismarine/prismarine/world/Level
@jsprismarine/prismarine/world/World
@jsprismarine/prismarine/scripting/LevelScripts
@jsprismarine/prismarine/scripting/LevelScriptWorld
@jsprismarine/prismarine/scripting/ScriptHttpInputs
```
<!-- /fact -->

If your program needs a module that is not an entry point, open an issue, so it can be made
public on purpose.

### Events

`server.on(name, listener)` takes one of these <!-- fact:events.count -->28<!-- /fact --> events, and
`server.once`, `server.removeListener` and `server.removeAllListeners` take the same names. They
subscribe on the kernel's event bus, `server.getKernel().events`, which the server raises every
event on.

- Listeners run in the order they subscribed. Subscribing the same function to an event twice
  calls it once. When one of the two is `server.on` and the other `server.once`, in either order,
  the function stays subscribed until `server.removeListener` removes it.
- Calling `event.preventDefault()` cancels an event where the server checks for it, such as a chat
  message, a player's move or a trip through a portal. The server reads the cancel as soon as the
  listeners return, so a listener that cancels after an `await` is too late.
- A canceled `chat` message reaches no player, and the listeners after the one that canceled still
  run and see `event.isCanceled()`.
- A listener that throws or rejects is logged. The listeners after it still run, and the action
  that raised the event goes on.
- The server waits for an asynchronous listener only for the RakNet events, one listener after
  another. For every other event, what a listener does after its first `await` runs later.

<!-- fact:events.table -->
| Event                      | Listener receives               |
| -------------------------- | ------------------------------- |
| `chat`                     | `ChatEvent`                     |
| `tick`                     | `TickEvent`                     |
| `entityDamage`             | `EntityDamageEvent`             |
| `entityHurt`               | `EntityHurtEvent`               |
| `entityDeath`              | `EntityDeathEvent`              |
| `entitySpawn`              | `EntitySpawnEvent`              |
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
| `playerBreakBlock`         | `PlayerBreakBlockEvent`         |
| `playerBlockBroken`        | `PlayerBlockBrokenEvent`        |
| `playerUseItem`            | `PlayerUseItemEvent`            |
| `playerItemUsed`           | `PlayerItemUsedEvent`           |
| `playerInteractBlock`      | `PlayerInteractBlockEvent`      |
| `playerBlockInteracted`    | `PlayerBlockInteractedEvent`    |
| `playerInteractEntity`     | `PlayerInteractEntityEvent`     |
| `playerEntityInteracted`   | `PlayerEntityInteractedEvent`   |
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
