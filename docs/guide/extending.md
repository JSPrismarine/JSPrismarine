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

The script host, the part of JSPrismarine that runs scripts, is QuickJS in a native library that
`@jsprismarine/script-host` ships. Builds exist for
<!-- fact:scripting.buildPlatforms -->macOS on Apple silicon, Linux on arm64 with glibc, Linux on arm64 with musl, Linux on x64 with glibc, Linux on x64 with musl and Windows on x64<!-- /fact -->. The package's install script downloads
the build for your machine from the project's GitHub releases and checks its SHA-256, so nothing
compiles on your machine.

npm, pnpm and Bun can hold that install script back until you approve the package. When it has not
run, the server's warning names the command that approves it for your package manager. To load a
library file instead, for a machine that installs without scripts or cannot reach GitHub, set
`JSP_SCRIPT_HOST_LIBRARY` to its path. The file must be the published build, or a `build:native`
output with the `build.json` it writes beside it.

In a checkout, `pnpm install` downloads the build the same way. Once you change the native sources,
no published build matches them, and you build the library yourself:

```bash
pnpm --filter @jsprismarine/script-host run build:native
```

The build needs a C compiler, `tar` that reads `.tar.xz`, and `git`. The compiler is `cc`, or
MinGW-w64's `gcc` on Windows, unless `CC` names another. The build downloads the pinned QuickJS
release into the checkout's cache.

A server without the library still loads every pack. It runs their content, skips their scripts,
and logs a warning that says how many packs have scripts and why they don't run.

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

Every level in `worlds` runs the packs from startup, each in a script engine of its own, so a script in
one level never sees another level's dimensions, players or dynamic properties. All levels load
the same packs. Within a level, each pack gets a JavaScript context of its own, so two packs never
share a `globalThis`. A custom command runs in the scripts of the level it's typed in, and the
script debugger attaches to the `level-name` level's engine.

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
- An alpha version, such as `3.0.0-alpha`, or the word `alpha`, is refused. BDS loads one, but
  Mojang publishes no description of the alpha APIs for the server to serve, so the message says
  that and asks for a stable or beta version
  ([#3233](https://github.com/JSPrismarine/JSPrismarine/issues/3233)).
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
show, such as through a computed property name, isn't counted. A name counts only when it is a
member of a class your scripts can reach from what they import, so `server.levels` on another
API isn't taken for a Script API class's `levels`.

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

JSPrismarine speaks the protocol of the Minecraft Bedrock Debugger for VS Code
(`mojang-studios.minecraft-debugger`), as BDS does, so you can stop at breakpoints in a pack's
scripts, step through them, inspect variables and run commands from the debug console.

1. Turn on `allow-inbound-script-debugging` in `config.json` and start the server.
2. Run `script debugger listen <!-- fact:scripting.debuggerPort -->19144<!-- /fact -->` on the console.
3. In VS Code, open the pack's folder and start an `attach` configuration of type `minecraft-js`
   with `"mode": "connect"`, the same port, `"localRoot"` set to the pack's `scripts/` folder, and
   `"targetModuleUuid"` set to the UUID of the pack's script module.
4. Run `script debugger close` on the console when you are done.

To connect the other way, with VS Code listening, turn on `allow-outbound-script-debugging`, set
`"mode": "listen"` and run `script debugger connect localhost <port>`. `script-debugger-auto-attach`
attaches before the scripts start, so a breakpoint on a script's first lines stops too, and
[Every setting](running.md#every-setting) lists the other `script-debugger-*` settings. While a
script is stopped at a breakpoint, the server does not tick.

The debugger stays attached across `/reload`, and the debug console's commands run between ticks.
Two things differ from BDS:

- BDS stops its server while it waits for the extension's handshake. JSPrismarine keeps ticking and
  attaches once the answer arrives.
- The profiler records the stack each time the debugger checks in, which happens after a fixed
  number of script lines, so it measures lines run rather than time, and a short script may leave no
  samples.

### Share a pack as an addon

An addon is a script pack with an `addon.json`, released on GitHub so that server owners install it
from the console with `addon install`. [Writing an addon](writing-addons.md) turns a pack into one,
[Publishing addons](publishing-addons.md) releases it, and [Installing addons](installing-addons.md)
is the owner's side. [Addons](../addons/README.md) lists the ones JSPrismarine publishes.

### Use JSPrismarine-only features

A pack can import `@jsprismarine/server` to read what only JSPrismarine offers, such as which
server and version it runs on. Leave the module out of the manifest and load it with `import()`
inside `try`, and the same pack still loads on BDS, where the import rejects.
[The JSPrismarine script module](jsprismarine-module.md) shows the pattern and lists every member.

## Add content with packs

List the packs in `config.json` and restart the server:

<!-- fact:config.contentTable -->
| Setting                | What it does                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `content-strict`       | Whether a pack that reports an error stops the server instead of loading short.                                            |
| `content-world-packs`  | Extra behavior pack directories this world loads, after the vanilla ones.                                                  |
| `content-datapacks`    | Java datapack directories this world loads, after the vanilla one.                                                         |
| `content-java-version` | The pinned Java release whose datapack, world generation and data version the server runs. Empty runs the default release. |
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

### List another edition

The startup log and `/version` list each edition the server speaks: Bedrock, Java when
`java-enabled` is on, and any your program adds. To add one, pass it in the `Server` constructor's
`protocolProviders` option. Each provider implements `ProtocolProvider` from
`@jsprismarine/prismarine/protocolProviders`: the edition's name, and the protocols it speaks
with their releases, newest first, marking the one your program advertises and any preview.

```typescript
import type { ProtocolProvider } from '@jsprismarine/prismarine/protocolProviders';

const legacy: ProtocolProvider = {
    edition: 'Legacy Console Edition',
    protocols: () => [{ protocolVersion: 78, minecraftVersions: ['TU78'], advertised: true, preview: false }]
};

const server = new Server({ config, logger, protocolProviders: [legacy] });
```

A provider only describes the edition; your program serves its clients. `--version` starts no
server, so it lists the built-in editions alone.

### Entry points

The package publishes <!-- fact:prismarine.entryPoints.count -->303<!-- /fact --> entry points, and
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
@jsprismarine/prismarine/player/PlayerSession
@jsprismarine/prismarine/network/ReplayManifest
@jsprismarine/prismarine/about
@jsprismarine/prismarine/stats/StatsMetric
@jsprismarine/prismarine/stats/StatsPlatform
@jsprismarine/prismarine/stats/StatsProvider
@jsprismarine/prismarine/stats/StatsRegistry
@jsprismarine/prismarine/stats/serverMetrics
@jsprismarine/prismarine/version
@jsprismarine/prismarine/world/GeneratorFactories
@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator
@jsprismarine/prismarine/world/generators/datadriven/SharedTerrainTileStore
@jsprismarine/prismarine/world/Level
@jsprismarine/prismarine/world/World
@jsprismarine/prismarine/scripting/LevelScripts
@jsprismarine/prismarine/scripting/LevelScriptWorld
@jsprismarine/prismarine/scripting/DataDrivenScreens
@jsprismarine/prismarine/scripting/ScriptHttpInputs
@jsprismarine/prismarine/player/presenter/SessionPresenter
@jsprismarine/prismarine/utils/Service
@jsprismarine/prismarine/ban/BanManager
@jsprismarine/prismarine/chat/ChatManager
@jsprismarine/prismarine/command/CommandManager
@jsprismarine/prismarine/modules/network
@jsprismarine/prismarine/network/PacketHandlerRegistry
@jsprismarine/prismarine/permission/PermissionManager
@jsprismarine/prismarine/modules/ticker
@jsprismarine/prismarine/world/WorldManager
@jsprismarine/prismarine/world/ShownActor
@jsprismarine/prismarine/world/SpawnPlacement
@jsprismarine/prismarine/world/Generator
@jsprismarine/prismarine/config/JsonConfigTypes
@jsprismarine/prismarine/protocolProviders
@jsprismarine/prismarine/network/codec/ProtocolPolicy
@jsprismarine/prismarine/events/entity/EntityEffectAddEvent
@jsprismarine/prismarine/events/entity/EntityEffectAddedEvent
@jsprismarine/prismarine/events/entity/EntityHealEvent
@jsprismarine/prismarine/events/entity/EntityHealedEvent
@jsprismarine/prismarine/events/entity/EntityHealthChangedEvent
@jsprismarine/prismarine/events/entity/EntityHitEntityEvent
@jsprismarine/prismarine/events/entity/EntityHurtEvent
@jsprismarine/prismarine/events/entity/EntityItemDropEvent
@jsprismarine/prismarine/events/entity/EntityItemPickedUpEvent
@jsprismarine/prismarine/events/entity/EntityItemPickupEvent
@jsprismarine/prismarine/events/entity/EntityRemoveEvent
@jsprismarine/prismarine/events/entity/EntityRemovedEvent
@jsprismarine/prismarine/events/entity/EntitySpawnEvent
@jsprismarine/prismarine/events/entity/EntityTameEvent
@jsprismarine/prismarine/events/entity/EntityTamedEvent
@jsprismarine/prismarine/events/entity/EntityTriggerEvent
@jsprismarine/prismarine/events/other/ExplodedEvent
@jsprismarine/prismarine/events/other/ExplosionEvent
@jsprismarine/prismarine/events/other/GameRuleChangedEvent
@jsprismarine/prismarine/events/player/PlayerAttackEntityEvent
@jsprismarine/prismarine/events/player/PlayerBlockActionEvent
@jsprismarine/prismarine/events/player/PlayerBlockBrokenEvent
@jsprismarine/prismarine/events/player/PlayerBlockInteractedEvent
@jsprismarine/prismarine/events/player/PlayerBlockPlacedEvent
@jsprismarine/prismarine/events/player/PlayerBreakBlockEvent
@jsprismarine/prismarine/events/player/PlayerButtonInputEvent
@jsprismarine/prismarine/events/player/PlayerContainerEvent
@jsprismarine/prismarine/events/player/PlayerCraftEvent
@jsprismarine/prismarine/events/player/PlayerDimensionChangedEvent
@jsprismarine/prismarine/events/player/PlayerEmoteEvent
@jsprismarine/prismarine/events/player/PlayerEntityInteractedEvent
@jsprismarine/prismarine/events/player/PlayerGamemodeChangedEvent
@jsprismarine/prismarine/events/player/PlayerInputModeChangeEvent
@jsprismarine/prismarine/events/player/PlayerInteractBlockEvent
@jsprismarine/prismarine/events/player/PlayerInteractEntityEvent
@jsprismarine/prismarine/events/player/PlayerItemUsedEvent
@jsprismarine/prismarine/events/player/PlayerItemUseStageEvent
@jsprismarine/prismarine/events/player/PlayerNameEntityEvent
@jsprismarine/prismarine/events/player/PlayerPlaceBlockEvent
@jsprismarine/prismarine/events/player/PlayerScriptMessageEvent
@jsprismarine/prismarine/events/player/PlayerSwingEvent
@jsprismarine/prismarine/events/player/PlayerUseItemEvent
@jsprismarine/prismarine/events/entity/ProjectileHitEvent
@jsprismarine/prismarine/events/other/RedstoneActivatedEvent
@jsprismarine/prismarine/playerIdentity
@jsprismarine/prismarine/item/Item
@jsprismarine/prismarine/scripting/ScriptDebugger
@jsprismarine/prismarine/scripting/scriptPlayerActions
@jsprismarine/prismarine/world/Weather
@jsprismarine/prismarine/scripting/events/worldEvents
@jsprismarine/prismarine/command/host/randomSequences
@jsprismarine/prismarine/SessionManager
@jsprismarine/prismarine/world/ChunkCompletionQueue
@jsprismarine/prismarine/world/DimensionType
@jsprismarine/prismarine/world/BaseGenerator
@jsprismarine/prismarine/world/generators/datadriven/TerrainProtoCache
@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenData
@jsprismarine/prismarine/world/generators/datadriven/javaStructureStarts
@jsprismarine/prismarine/world/generators/datadriven/javaTemplatePlacement
@jsprismarine/prismarine/world/generators/datadriven/javaStructureBeard
@jsprismarine/prismarine/world/generators/datadriven/javaBlending
@jsprismarine/prismarine/world/providers/BaseProvider
@jsprismarine/prismarine/world/redstoneUpdates
@jsprismarine/prismarine/inventory/persistence
@jsprismarine/prismarine/world/RespawnPoint
@jsprismarine/prismarine/command/CommandExecutor
@jsprismarine/prismarine/content/ServerContent
@jsprismarine/prismarine/content/world/fluidReplacement
@jsprismarine/prismarine/entity/data/storeActors
@jsprismarine/prismarine/entity/DamageSource
@jsprismarine/prismarine/world/portal/DimensionTravel
@jsprismarine/prismarine/player/ChunkSender
@jsprismarine/prismarine/entity/data/storePlayers
@jsprismarine/prismarine/entity/data/facts
@jsprismarine/prismarine/network/ClientConnection
@jsprismarine/prismarine/entity/predicateView
@jsprismarine/prismarine/entity/Experience
@jsprismarine/prismarine/inventory/HumanInventory
@jsprismarine/prismarine/entity/storePlayer
@jsprismarine/prismarine/entity/StatusEffect
@jsprismarine/prismarine/enchantment/anvil
@jsprismarine/prismarine/enchantment/enchantingTable
@jsprismarine/prismarine/enchantment/mending
@jsprismarine/prismarine/world/physics/BlockRules
@jsprismarine/prismarine/entity/StatusEffectTick
@jsprismarine/prismarine/entity/data/EntityRuntime
@jsprismarine/prismarine/keyedPlayer
@jsprismarine/prismarine/world/ShownPlayer
@jsprismarine/prismarine/world/ChunkScheduler
@jsprismarine/prismarine/world/providers/Provider
@jsprismarine/prismarine/addons/AddonManager
@jsprismarine/prismarine/Console
@jsprismarine/prismarine/command/ConsoleSender
@jsprismarine/prismarine/content/world/serverSource
@jsprismarine/prismarine/inventory/CreativeInventory
@jsprismarine/prismarine/entity/data/live
@jsprismarine/prismarine/advancement/javaEnglish
@jsprismarine/prismarine/network/PacketLogFilter
@jsprismarine/prismarine/utils/Random
@jsprismarine/prismarine/world/RespawnRequests
@jsprismarine/prismarine/profiling/TickRecorder
@jsprismarine/prismarine/content/withheldContent
@jsprismarine/prismarine/world/WorldMessages
@jsprismarine/prismarine/network/NetworkWorldReplicator
@jsprismarine/prismarine/world/generators/datadriven/GenerationRegion
@jsprismarine/prismarine/world/generators/datadriven/mergedChunk
@jsprismarine/prismarine/world/chunk/Chunk
@jsprismarine/prismarine/world/dynamicProperties
@jsprismarine/prismarine/world/GameRuleManager
@jsprismarine/prismarine/world/PlayerPersistence
@jsprismarine/prismarine/world/RespawnSearch
@jsprismarine/prismarine/world/Scoreboard
@jsprismarine/prismarine/world/WorldPersistence
@jsprismarine/prismarine/world/raid/RaidManager
@jsprismarine/prismarine/world/ChunkTickets
@jsprismarine/prismarine/block/Block
@jsprismarine/prismarine/block/state/BlockState
@jsprismarine/prismarine/world/BlockUpdateScheduler
@jsprismarine/prismarine/world/end/DragonFight
@jsprismarine/prismarine/entity/data/entityIndex
@jsprismarine/prismarine/entity/data/EntityStore
@jsprismarine/prismarine/world/portal/PortalIndex
@jsprismarine/prismarine/world/WorldSystems
@jsprismarine/prismarine/world/changelog/ChangeLog
@jsprismarine/prismarine/world/BlockMining
@jsprismarine/prismarine/player/sessionPlayers
@jsprismarine/prismarine/entity/DeathMessages
@jsprismarine/prismarine/world/generators/datadriven/chunkPipeline
@jsprismarine/prismarine/world/GameEventListenerRegistry
@jsprismarine/prismarine/world/WorldChangeSink
@jsprismarine/prismarine/content/world/adapter
@jsprismarine/prismarine/world/playerRecord
@jsprismarine/prismarine/network/transport/Transport
@jsprismarine/prismarine/scripting/scriptEntityEvents
@jsprismarine/prismarine/world/changelog/changeLogCost
@jsprismarine/prismarine/entity/data/scene
@jsprismarine/prismarine/player/context/ConnectionContext
@jsprismarine/prismarine/player/context/SessionHandler
@jsprismarine/prismarine/addons/addonFiles
@jsprismarine/prismarine/identity/Subject
@jsprismarine/prismarine/item/blockTransformers
@jsprismarine/prismarine/entity/regionalDifficulty
@jsprismarine/prismarine/scripting/scriptComponents
@jsprismarine/prismarine/content/tags
@jsprismarine/prismarine/content/world/views
@jsprismarine/prismarine/entity/DamageCause
@jsprismarine/prismarine/entity/data/areaEffectCloud
@jsprismarine/prismarine/entity/data/damagePipeline
@jsprismarine/prismarine/entity/data/droppedItems
@jsprismarine/prismarine/entity/data/evokerFangs
@jsprismarine/prismarine/entity/data/experienceOrbs
@jsprismarine/prismarine/entity/data/eyeOfEnderSignals
@jsprismarine/prismarine/entity/data/hangingEntities
@jsprismarine/prismarine/entity/data/ominousItemSpawner
@jsprismarine/prismarine/entity/data/playerSystems
@jsprismarine/prismarine/entity/data/host
@jsprismarine/prismarine/entity/data/DataEntity
@jsprismarine/prismarine/utils/Device
@jsprismarine/prismarine/entity/data/persistence
@jsprismarine/prismarine/network/SessionPhase
@jsprismarine/prismarine/entity/playerComponents
@jsprismarine/prismarine/world/changelog/ChangeEntry
@jsprismarine/prismarine/world/changelog/TickHeader
@jsprismarine/prismarine/world/chunk/SubChunk
@jsprismarine/prismarine/world/ChunkAdmissions
@jsprismarine/prismarine/world/generators/datadriven/featurePatchWire
@jsprismarine/prismarine/world/generators/datadriven/javaStructureWorld
@jsprismarine/prismarine/world/generators/datadriven/javaStructureTemplatePiece
@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenSources
@jsprismarine/prismarine/world/generators/datadriven/bedrockSections
@jsprismarine/prismarine/command/function/runtime
@jsprismarine/prismarine/content/ContentOptions
@jsprismarine/prismarine/item/actorPort
@jsprismarine/prismarine/entity/data/itemInteraction
@jsprismarine/prismarine/entity/data/navigationView
@jsprismarine/prismarine/world/changelog/PlainData
@jsprismarine/prismarine/entity/data/itemSteering
@jsprismarine/prismarine/entity/PortalContact
@jsprismarine/prismarine/entity/data/actorMetadata
@jsprismarine/prismarine/crafting/CraftingInput
@jsprismarine/prismarine/inventory/ItemContainer
@jsprismarine/prismarine/inventory/EntityInventory
@jsprismarine/prismarine/inventory/slotLog
@jsprismarine/prismarine/inventory/slotAddress
@jsprismarine/prismarine/network/replica/BlockReplica
@jsprismarine/prismarine/network/replica/EntityReplica
@jsprismarine/prismarine/network/replica/EntityReplication
@jsprismarine/prismarine/entity/data/actorView
@jsprismarine/prismarine/input/IntentHandlerRegistry
@jsprismarine/prismarine/permission/model
@jsprismarine/prismarine/network/playerListEntry
@jsprismarine/prismarine/world/chunk/ChunkBiomes
@jsprismarine/prismarine/blockentity/BlockEntity
@jsprismarine/prismarine/world/EntitySpawn
@jsprismarine/prismarine/blockentity/BlockEntities
@jsprismarine/prismarine/world/chunk/ChunkGeneration
@jsprismarine/prismarine/world/generators/datadriven/javaStructurePlacement
@jsprismarine/prismarine/world/providers/SavePass
@jsprismarine/prismarine/world/Proximity
@jsprismarine/prismarine/command/function/load
@jsprismarine/prismarine/entity/data/itemActor
@jsprismarine/prismarine/entity/EntitySerializer
@jsprismarine/prismarine/world/portal/rules
@jsprismarine/prismarine/network/MinecraftSession
@jsprismarine/prismarine/network/encodePacketBatch
@jsprismarine/prismarine/editions/bedrock/decoder/PacketDecoder
@jsprismarine/prismarine/input/Intent
@jsprismarine/prismarine/network/replica/firstSight
@jsprismarine/prismarine/network/contentAdapter
@jsprismarine/prismarine/world/providers/ChunkSaveContext
@jsprismarine/prismarine/world/cooking
@jsprismarine/prismarine/world/lootLevel
@jsprismarine/prismarine/world/mapColors
@jsprismarine/prismarine/world/mapCarriers
@jsprismarine/prismarine/world/mapTerrain
@jsprismarine/prismarine/world/mapRender
@jsprismarine/prismarine/world/savedMap
@jsprismarine/prismarine/command/host/support
@jsprismarine/prismarine/editions/bedrock/LoginIdentity
@jsprismarine/prismarine/entity/equipment
@jsprismarine/prismarine/entity/data/observedCollections
@jsprismarine/prismarine/entity/data/damageLog
@jsprismarine/prismarine/player/context/HandlerContext
@jsprismarine/prismarine/world/positionKeys
@jsprismarine/prismarine/crafting/CraftingGrid
@jsprismarine/prismarine/entity/data/damageStages
@jsprismarine/prismarine/entity/playerShown
@jsprismarine/prismarine/advancement/raise
@jsprismarine/prismarine/world/chunk/biomePalette
@jsprismarine/prismarine/world/chunk/BlockStorage
@jsprismarine/prismarine/command/function/schedule
@jsprismarine/prismarine/entity/data/paintings
@jsprismarine/prismarine/input/IntentHandler
@jsprismarine/prismarine/item/contentAdapter
@jsprismarine/prismarine/editions/bedrock/decoder/DecodeView
@jsprismarine/prismarine/block/contentAdapter
```
<!-- /fact -->

If your program needs a module that is not an entry point, open an issue, so it can be made
public on purpose.

### Events

`server.on(name, listener)` takes one of these <!-- fact:events.count -->65<!-- /fact --> events, and
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
| `levelAttached`            | `LevelAttachedEvent`            |
| `levelDetaching`           | `LevelDetachingEvent`           |
| `levelDetached`            | `LevelDetachedEvent`            |
| `tick`                     | `TickEvent`                     |
| `explosion`                | `ExplosionEvent`                |
| `exploded`                 | `ExplodedEvent`                 |
| `gameRuleChanged`          | `GameRuleChangedEvent`          |
| `redstoneActivated`        | `RedstoneActivatedEvent`        |
| `entityDamage`             | `EntityDamageEvent`             |
| `entityHurt`               | `EntityHurtEvent`               |
| `entityDeath`              | `EntityDeathEvent`              |
| `entitySpawn`              | `EntitySpawnEvent`              |
| `entityRemove`             | `EntityRemoveEvent`             |
| `entityHitEntity`          | `EntityHitEntityEvent`          |
| `projectileHit`            | `ProjectileHitEvent`            |
| `entityTrigger`            | `EntityTriggerEvent`            |
| `entityTame`               | `EntityTameEvent`               |
| `entityTamed`              | `EntityTamedEvent`              |
| `entityItemDrop`           | `EntityItemDropEvent`           |
| `entityItemPickup`         | `EntityItemPickupEvent`         |
| `entityItemPickedUp`       | `EntityItemPickedUpEvent`       |
| `entityEffectAdd`          | `EntityEffectAddEvent`          |
| `entityHeal`               | `EntityHealEvent`               |
| `entityHealed`             | `EntityHealedEvent`             |
| `entityHealthChanged`      | `EntityHealthChangedEvent`      |
| `entityEffectAdded`        | `EntityEffectAddedEvent`        |
| `playerAttackEntity`       | `PlayerAttackEntityEvent`       |
| `entityRemoved`            | `EntityRemovedEvent`            |
| `entityPortalEnter`        | `EntityPortalEnterEvent`        |
| `playerChangeDimension`    | `PlayerChangeDimensionEvent`    |
| `playerDimensionChanged`   | `PlayerDimensionChangedEvent`   |
| `playerConnect`            | `PlayerConnectEvent`            |
| `playerDisconnect`         | `PlayerDisconnectEvent`         |
| `playerSpawn`              | `PlayerSpawnEvent`              |
| `playerDespawn`            | `PlayerDespawnEvent`            |
| `playerEmote`              | `PlayerEmoteEvent`              |
| `playerSwing`              | `PlayerSwingEvent`              |
| `playerNameEntity`         | `PlayerNameEntityEvent`         |
| `playerContainer`          | `PlayerContainerEvent`          |
| `playerScriptMessage`      | `PlayerScriptMessageEvent`      |
| `playerCraft`              | `PlayerCraftEvent`              |
| `playerButtonInput`        | `PlayerButtonInputEvent`        |
| `playerInputModeChange`    | `PlayerInputModeChangeEvent`    |
| `playerMove`               | `PlayerMoveEvent`               |
| `playerToggleFlight`       | `PlayerToggleFlightEvent`       |
| `playerToggleSprint`       | `PlayerToggleSprintEvent`       |
| `playerToggleOperator`     | `PlayerToggleOperatorEvent`     |
| `playerSetGamemode`        | `PlayerSetGamemodeEvent`        |
| `playerGamemodeChanged`    | `PlayerGamemodeChangedEvent`    |
| `playerBreakBlock`         | `PlayerBreakBlockEvent`         |
| `playerBlockBroken`        | `PlayerBlockBrokenEvent`        |
| `playerBlockAction`        | `PlayerBlockActionEvent`        |
| `playerUseItem`            | `PlayerUseItemEvent`            |
| `playerItemUsed`           | `PlayerItemUsedEvent`           |
| `playerItemUseStage`       | `PlayerItemUseStageEvent`       |
| `playerInteractBlock`      | `PlayerInteractBlockEvent`      |
| `playerBlockInteracted`    | `PlayerBlockInteractedEvent`    |
| `playerInteractEntity`     | `PlayerInteractEntityEvent`     |
| `playerEntityInteracted`   | `PlayerEntityInteractedEvent`   |
| `playerPlaceBlock`         | `PlayerPlaceBlockEvent`         |
| `playerBlockPlaced`        | `PlayerBlockPlacedEvent`        |
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
