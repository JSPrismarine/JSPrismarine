---
title: The JSPrismarine script module
description: Use JSPrismarine-only features from a behavior pack script and keep the pack running on Bedrock Dedicated Server.
group: Documents
category: Guides
---

# The JSPrismarine script module

A behavior pack script can import `@jsprismarine/server` to reach what only JSPrismarine offers.
The same pack still loads on Bedrock Dedicated Server (BDS), as long as it detects the module and
falls back when the module is missing. This page shows that pattern and lists what the module
holds today.

## Detect the module and fall back

Leave `@jsprismarine/server` out of `manifest.json`, and load it with `import()` inside `try`:

```js
import { world } from '@minecraft/server';

/** The JSPrismarine module, or undefined on a server without it. */
const loadJsprismarine = async () => {
    try {
        return await import('@jsprismarine/server');
    } catch {
        return undefined;
    }
};

world.afterEvents.worldLoad.subscribe(async () => {
    const jsp = await loadJsprismarine();
    if (jsp === undefined) {
        world.sendMessage('Running on Bedrock Dedicated Server');
        return;
    }
    const { name, version, minecraftVersion } = jsp.jsprismarine;
    world.sendMessage(`Running on ${name} ${version}, for Minecraft ${minecraftVersion}`);
});
```

On BDS the import rejects with
`ReferenceError: Module [@jsprismarine/server] is unrecognized. If this is a Native module, did you remember to add it to your manifest.json?`,
the `catch` returns `undefined`, and the pack goes on without it. On JSPrismarine the import
resolves to the module.

Each part of the pattern matters on BDS:

- **No manifest entry.** BDS refuses to load a pack that declares a module it does not know, even
  with `"optional": true`. The whole pack fails, and only the content log says why.
- **`import()`, not a static `import`.** BDS rejects a static import of the module too, and the
  file that holds it fails to load. When that file is the pack's entry, none of the pack's scripts
  run. JSPrismarine resolves both forms, because a module whose name starts with `@jsprismarine/`
  needs no manifest entry there.
- **Inside `try`, or with `.catch()`.** A rejection nobody handles ends the callback that awaited
  it.

Every `@minecraft/` module still needs its manifest entry on JSPrismarine, as on BDS. An import of
any other `@jsprismarine/` name rejects with the same message BDS gives.

## What the module holds

Every export is frozen. `jsprismarine` holds plain values that stay the same while the server
runs. `performance`, `getPing` and `bossBars` reach the running server: each property of
`performance` reads the server when the script reads it, so a script that wants the numbers for
the current tick reads them again.

<!-- fact:scripting.jspModule.table -->
| Member                           | Type                | What it is                                                                                                                                                         |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jsprismarine`                   | object              | The server the pack runs on.                                                                                                                                       |
| `jsprismarine.name`              | `"JSPrismarine"`    | The server software, always `JSPrismarine`.                                                                                                                        |
| `jsprismarine.version`           | string              | The JSPrismarine version, such as `0.22.0`, without a leading `v`.                                                                                                 |
| `jsprismarine.minecraftVersion`  | string              | The newest Minecraft Bedrock release the server speaks, the one it advertises.                                                                                     |
| `jsprismarine.protocolVersion`   | number              | The Bedrock network protocol version of `minecraftVersion`.                                                                                                        |
| `performance`                    | object              | How fast the server ticks. Each property reads the server when the script reads it.                                                                                |
| `performance.tps`                | number              | Ticks per second over the last second. The server aims for 20, and runs above it while it catches up.                                                              |
| `performance.tpsAverages`        | `readonly number[]` | Ticks per second averaged over the windows `/tps` reports, shortest first.                                                                                         |
| `performance.lastTickMs`         | number              | How long the last tick's work took, in milliseconds, without the wait before the next tick. Zero before the first tick.                                            |
| `performance.averageTickMs`      | number              | How long a tick's work has taken lately, in milliseconds, as a moving average over the recent ticks. Zero before the first tick.                                   |
| `getPing(player)`                | function            | The player's round trip time in milliseconds, or `undefined` while their connection has no sample, after they leave, or when their transport measures none.        |
| `bossBars`                       | object              | Boss bars on one player's screen. A bar belongs to the pack that showed it and goes away when the player leaves or the pack's scripts stop, as on `/reload`.       |
| `bossBars.show(player, options)` | function            | Shows a boss bar to one player. A player sees the bar shown last, and the one before it again once that one is hidden. A bar for a player who left is never valid. |
<!-- /fact -->

The members take and give these types, which `@jsprismarine/script-types` declares:

<!-- fact:scripting.jspModule.types -->
| Type                       | Kind           | What it is                                                                                                                              |
| -------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Player`                   | interface      | A `Player` from `@minecraft/server`. The members take only a real one; this names what they read, so the pack's own `Player` type fits. |
| `Player.id`                | string         | The player's entity id.                                                                                                                 |
| `BossBarColor`             | string         | A boss bar's color. One of `pink`, `blue`, `red`, `green`, `yellow`, `purple`, `rebeccaPurple`, `white`.                                |
| `BossBarOptions`           | interface      | What a boss bar shows.                                                                                                                  |
| `BossBarOptions.text?`     | string         | The title above the bar. Empty when a bar is shown without it.                                                                          |
| `BossBarOptions.progress?` | number         | How full the bar is, from 0 to 1, clamped to that range. Full when a bar is shown without it.                                           |
| `BossBarOptions.color?`    | `BossBarColor` | The bar's color. Pink when a bar is shown without it.                                                                                   |
| `BossBar`                  | interface      | A boss bar on one player's screen.                                                                                                      |
| `BossBar.player`           | `Player`       | The player who sees the bar.                                                                                                            |
| `BossBar.isValid`          | boolean        | Whether the bar is still there: false once it is hidden, once the player leaves and once the pack's scripts stop.                       |
| `BossBar.update(options)`  | function       | Changes what the bar shows. A property the options leave out keeps its value. Does nothing to a bar that is no longer valid.            |
| `BossBar.hide()`           | function       | Takes the bar off the screen for good. Does nothing to a bar that is no longer valid.                                                   |
<!-- /fact -->

## Show a boss bar

`bossBars.show` puts a bar on one player's screen and returns it. The pack keeps the bar to change
it with `update` and take it down with `hide`. This one shows the server's ticks per second, the
milliseconds the last tick took and the player's ping, and refreshes once a second:

```js
import { system, world } from '@minecraft/server';

world.afterEvents.worldLoad.subscribe(async () => {
    const jsp = await loadJsprismarine();
    if (jsp === undefined || !('bossBars' in jsp)) return;
    const bars = new Map();
    system.runInterval(() => {
        // A bar is invalid once its player leaves, so dropping those keeps the map to the players online.
        for (const [id, bar] of bars) if (!bar.isValid) bars.delete(id);
        for (const player of world.getAllPlayers()) {
            const { tps, lastTickMs } = jsp.performance;
            const ping = jsp.getPing(player);
            const options = {
                text: `TPS: ${tps.toFixed(1)} MSPT: ${lastTickMs.toFixed(1)} Ping: ${ping ?? '?'}ms`,
                progress: Math.min(1, lastTickMs / 50),
                color: tps >= 19.5 ? 'green' : 'red'
            };
            const bar = bars.get(player.id);
            if (bar?.isValid) bar.update(options);
            else bars.set(player.id, jsp.bossBars.show(player, options));
        }
    }, 20);
});
```

`loadJsprismarine` is the function from [the first example](#detect-the-module-and-fall-back).

A bar belongs to the scripts that showed it. It goes when the player leaves, and every bar goes
when the scripts stop, on `/reload` or at shutdown, so a pack never leaves one behind. A player who
has bars from several packs sees the one shown last, and the one before it again once that one is
hidden. `getPing` answers `undefined` until the player's connection has measured a round trip:
RakNet's from the acknowledgments of its datagrams, NetherNet's from SCTP's under the data
channels.

Later JSPrismarine versions add members. To use one that an older server may lack, check for it
before you call it, the same way you check for the module:

```js
const jsp = await loadJsprismarine();
if (jsp !== undefined && 'someNewMember' in jsp) {
    // JSPrismarine new enough to have it
}
```

## Types for TypeScript

`@jsprismarine/script-types` holds the declarations. The npm name `@jsprismarine/server` belongs to
the server package, so the declarations package has its own name and declares the module inside.
Add it to `types` in your `tsconfig.json`, and `import('@jsprismarine/server')` is typed:

```json
{
    "compilerOptions": {
        "types": ["@jsprismarine/script-types"]
    }
}
```

Install it as a development dependency of your pack's project:

```bash
npm install --save-dev @jsprismarine/script-types
```

Its `dist/index.d.ts` comes from the same definition the server builds the module from.
