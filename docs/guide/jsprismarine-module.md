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
runs. `performance`, `getPing`, `bossBars`, `placeholders` and `permissions` reach the running server:
each property of `performance` reads the server when the script reads it, so a script that wants
the numbers for the current tick reads them again.

<!-- fact:scripting.jspModule.table -->
| Member                                           | Type                              | What it is                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsprismarine`                                   | object                            | The server the pack runs on.                                                                                                                                                                                                                                                              |
| `jsprismarine.name`                              | `"JSPrismarine"`                  | The server software, always `JSPrismarine`.                                                                                                                                                                                                                                               |
| `jsprismarine.version`                           | string                            | The JSPrismarine version, such as `0.22.0`, without a leading `v`.                                                                                                                                                                                                                        |
| `jsprismarine.minecraftVersion`                  | string                            | The newest Minecraft Bedrock release the server speaks, the one it advertises.                                                                                                                                                                                                            |
| `jsprismarine.protocolVersion`                   | number                            | The Bedrock network protocol version of `minecraftVersion`.                                                                                                                                                                                                                               |
| `jsprismarine.maxPlayers`                        | number                            | How many players may be online at once, the server's `max-players` setting.                                                                                                                                                                                                               |
| `performance`                                    | object                            | How fast the server ticks. Each property reads the server when the script reads it.                                                                                                                                                                                                       |
| `performance.tps`                                | number                            | Ticks per second over the last second. The server aims for 20, and runs above it while it catches up.                                                                                                                                                                                     |
| `performance.tpsAverages`                        | `readonly number[]`               | Ticks per second averaged over the windows `/tps` reports, shortest first.                                                                                                                                                                                                                |
| `performance.lastTickMs`                         | number                            | How long the last tick's work took, in milliseconds, without the wait before the next tick. Zero before the first tick.                                                                                                                                                                   |
| `performance.averageTickMs`                      | number                            | How long a tick's work has taken lately, in milliseconds, as a moving average over the recent ticks. Zero before the first tick.                                                                                                                                                          |
| `getPing(player)`                                | function                          | The player's round trip time in milliseconds, or `undefined` while their connection has no sample, after they leave, or when their transport measures none.                                                                                                                               |
| `bossBars`                                       | object                            | Boss bars on one player's screen. A bar belongs to the pack that showed it and goes away when the player leaves or the pack's scripts stop, as on `/reload`.                                                                                                                              |
| `bossBars.show(player, options)`                 | function                          | Shows a boss bar to one player. A player sees the bar shown last, and the one before it again once that one is hidden. A bar for a player who left is never valid.                                                                                                                        |
| `placeholders`                                   | object                            | Tokens such as `{player:ping}` that any pack can provide and any pack can render. A namespace belongs to the pack that registered it and goes when the pack's scripts stop, as on `/reload`.                                                                                              |
| `placeholders.namespaces`                        | `readonly PlaceholderNamespace[]` | Every registered namespace with its keys, oldest first, as a new frozen list each read.                                                                                                                                                                                                   |
| `placeholders.register(namespace, provider)`     | function                          | Registers a namespace. Throws a `TypeError` for a namespace or key that is not lowercase letters, digits and underscores starting with a letter, or for a provider with no keys, and an `Error` for a namespace that is registered already.                                               |
| `placeholders.resolve(text, player)`             | function                          | Replaces each `{namespace:key}` in the text with its value, for the player when one is given. A token nobody provides, or whose provider gives `undefined` or throws, stays as written, and so does any other text between braces.                                                        |
| `permissions`                                    | object                            | The groups, nodes and meta of `permissions.json`, resolved as the server resolves them for a command. A write persists to the file as `/perms` would, and `afterEvents.permissionsChange` fires after any write, from a script, `/perms`, `/op` or an edit of the file.                   |
| `permissions.afterEvents`                        | `PermissionsAfterEvents`          | The events the permission files raise.                                                                                                                                                                                                                                                    |
| `permissions.has(player, node)`                  | function                          | Whether the player holds the node after resolution: their own nodes, then their groups heaviest first and each group's parents, where a specific node beats a wildcard and a negation wins a tie. An operator holds every node.                                                           |
| `permissions.groupsOf(player)`                   | function                          | The groups the player holds directly, heaviest first, `default` and an operator's `operator` included.                                                                                                                                                                                    |
| `permissions.primaryGroupOf(player)`             | function                          | The heaviest group the player holds directly, or `default`.                                                                                                                                                                                                                               |
| `permissions.metaOf(player, key)`                | function                          | The resolved value of a meta key such as `prefix`, `suffix` or `level`: the player's own, then their groups' in resolution order. `undefined` when nothing sets it.                                                                                                                       |
| `permissions.grant(subject, node, expires)`      | function                          | Adds a node to a player, or to a group named by its name. Throws a `RangeError` for a node not spelled as `scope.name`, `scope.*` or `*` with at most one leading `-`, or for an expiry that is not an ISO 8601 instant in the future, and an `Error` for a group the file does not have. |
| `permissions.revoke(subject, node)`              | function                          | Removes a node from a player, or from a group named by its name. Does nothing when they do not have it.                                                                                                                                                                                   |
| `permissions.addToGroup(player, group, expires)` | function                          | Adds a player to a group, until `expires` when one is given. Throws an `Error` for a group the file does not have.                                                                                                                                                                        |
| `permissions.removeFromGroup(player, group)`     | function                          | Removes a player from a group. Does nothing when they are not in it.                                                                                                                                                                                                                      |
<!-- /fact -->

The members take and give these types, which `@jsprismarine/script-types` declares:

<!-- fact:scripting.jspModule.types -->
| Type                                            | Kind                      | What it is                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Player`                                        | interface                 | A `Player` from `@minecraft/server`. The members take only a real one; this names what they read, so the pack's own `Player` type fits.                                                                                                                                            |
| `Player.id`                                     | string                    | The player's entity id.                                                                                                                                                                                                                                                            |
| `BossBarColor`                                  | string                    | A boss bar's color. One of `pink`, `blue`, `red`, `green`, `yellow`, `purple`, `rebeccaPurple`, `white`.                                                                                                                                                                           |
| `BossBarOptions`                                | interface                 | What a boss bar shows.                                                                                                                                                                                                                                                             |
| `BossBarOptions.text?`                          | string                    | The title above the bar. Empty when a bar is shown without it.                                                                                                                                                                                                                     |
| `BossBarOptions.progress?`                      | number                    | How full the bar is, from 0 to 1, clamped to that range. Full when a bar is shown without it.                                                                                                                                                                                      |
| `BossBarOptions.color?`                         | `BossBarColor`            | The bar's color. Pink when a bar is shown without it.                                                                                                                                                                                                                              |
| `BossBar`                                       | interface                 | A boss bar on one player's screen.                                                                                                                                                                                                                                                 |
| `BossBar.player`                                | `Player`                  | The player who sees the bar.                                                                                                                                                                                                                                                       |
| `BossBar.isValid`                               | boolean                   | Whether the bar is still there: false once it is hidden, once the player leaves and once the pack's scripts stop.                                                                                                                                                                  |
| `BossBar.update(options)`                       | function                  | Changes what the bar shows. A property the options leave out keeps its value. Does nothing to a bar that is no longer valid.                                                                                                                                                       |
| `BossBar.hide()`                                | function                  | Takes the bar off the screen for good. Does nothing to a bar that is no longer valid.                                                                                                                                                                                              |
| `PlaceholderProvider`                           | interface                 | What a pack registers for a namespace: the keys it answers, and the function that answers them.                                                                                                                                                                                    |
| `PlaceholderProvider.keys`                      | `readonly string[]`       | The keys the provider answers, each lowercase letters, digits and underscores starting with a letter. A token with another key stays as written.                                                                                                                                   |
| `PlaceholderProvider.resolve(key, player)`      | function                  | The value of one key, for the player when the text is rendered for one. A number renders through `String()`. `undefined` leaves the token as written, and so does a throw, which the content log reports once per namespace. It runs inside the budget of the script that renders. |
| `PlaceholderRegistration`                       | interface                 | A namespace a pack registered.                                                                                                                                                                                                                                                     |
| `PlaceholderRegistration.unregister()`          | function                  | Takes the namespace out of the registry, so its tokens stay as written. A pack's namespaces go on their own when its scripts stop.                                                                                                                                                 |
| `PlaceholderNamespace`                          | interface                 | One registered namespace.                                                                                                                                                                                                                                                          |
| `PlaceholderNamespace.namespace`                | string                    | Its name, the part of a token before the colon.                                                                                                                                                                                                                                    |
| `PlaceholderNamespace.keys`                     | `readonly string[]`       | The keys its provider answers.                                                                                                                                                                                                                                                     |
| `PermissionsAfterEvents`                        | interface                 | The events the permission files raise, after the fact.                                                                                                                                                                                                                             |
| `PermissionsAfterEvents.permissionsChange`      | `PermissionsChangeSignal` | Fires after any write to the permission files, whoever made it, and after the files are read again on `/reload` or a change on disk.                                                                                                                                               |
| `PermissionsChangeSignal`                       | interface                 | Where a pack subscribes to permission changes.                                                                                                                                                                                                                                     |
| `PermissionsChangeSignal.subscribe(callback)`   | function                  | Calls `callback` after each change, with the player and the group it touched, and returns the callback. A pack's subscriptions end when its scripts stop.                                                                                                                          |
| `PermissionsChangeSignal.unsubscribe(callback)` | function                  | Stops calling a callback `subscribe` returned.                                                                                                                                                                                                                                     |
| `PermissionsChangeEvent`                        | interface                 | What a permission change touched. Both are absent after a reload, which may have changed anything.                                                                                                                                                                                 |
| `PermissionsChangeEvent.player?`                | `Player`                  | The player whose own record or operator status changed, when they are online.                                                                                                                                                                                                      |
| `PermissionsChangeEvent.group?`                 | string                    | The group that changed.                                                                                                                                                                                                                                                            |
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

## Provide and render placeholders

A placeholder is a token such as `{player:ping}` in a text. `placeholders` is the registry every
pack shares: one pack registers a namespace with the keys it answers, and any pack renders a text
through `resolve`, so a sidebar, a chat format or a tab list shows the same values without talking
to the pack that computes them. The [placeholders addon](../addons/README.md) registers the
`player`, `server` and `world` namespaces most servers want.

```js
import { world } from '@minecraft/server';

world.afterEvents.worldLoad.subscribe(async () => {
    const jsp = await loadJsprismarine();
    if (jsp === undefined || !('placeholders' in jsp)) return;
    jsp.placeholders.register('demo', {
        keys: ['name', 'ping', 'slots'],
        resolve(key, player) {
            if (key === 'slots') return jsp.jsprismarine.maxPlayers;
            if (player === undefined) return undefined;
            return key === 'name' ? player.name : jsp.getPing(player);
        }
    });
    for (const player of world.getAllPlayers()) {
        player.sendMessage(jsp.placeholders.resolve('{demo:name}, your ping is {demo:ping}ms', player));
    }
});
```

A namespace and a key are lowercase letters, digits and underscores, starting with a letter. Any
other text between braces is not a token and stays as written, so there is no escape syntax. A
token nobody provides stays as written too, so a missing addon shows in the text rather than
disappearing from it. The same goes for a key whose resolver gives `undefined`, such as `name`
above when the text is rendered for no player, and for one whose resolver throws: the content log
reports the first throw of each namespace, and the token stays.

A resolver runs inside the budget of the script that renders, so read a value rather than compute
one. A number renders through `String()`. `register` throws a `TypeError` for a malformed name or
a provider without keys, and an `Error` for a namespace that is registered already;
`placeholders.namespaces` lists the names in use with their keys. A namespace belongs to the pack
that registered it: `unregister` on the returned registration ends it, and every namespace of a
pack goes when its scripts stop, as on `/reload`.

## Read and change permissions

`permissions` reads and writes the groups, nodes and meta of `permissions.json`, which
[the running guide](running.md#permissions) describes, resolved the way the server resolves them
for a command. A write persists to the file as `/perms` would, and `afterEvents.permissionsChange`
fires after any write, whoever made it, and after the file is read again. This pack greets a player
with their prefix and primary group, and grants a rank for a day:

```js
import { world } from '@minecraft/server';

world.afterEvents.playerSpawn.subscribe(async ({ player, initialSpawn }) => {
    if (!initialSpawn) return;
    const jsp = await loadJsprismarine();
    if (jsp === undefined || !('permissions' in jsp)) return;
    const { permissions } = jsp;
    const prefix = permissions.metaOf(player, 'prefix') ?? '';
    player.sendMessage(`Welcome, ${prefix}${player.name} of ${permissions.primaryGroupOf(player)}`);
    if (!permissions.has(player, 'minecraft.command.me')) {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        permissions.addToGroup(player, 'trial', tomorrow);
    }
});
```

`loadJsprismarine` is the function from [the first example](#detect-the-module-and-fall-back).
`grant` and `revoke` take a `Player` or a group's name; `addToGroup` and `removeFromGroup` take a
`Player`. A bad node or expiry throws a `RangeError` at the call, a group the file lacks an
`Error`, and a `Player` who left a `TypeError`, before anything is written. The server also
registers the `perms` placeholder namespace with `primary_group`, `groups`, `prefix`, `suffix`
and `weight`, so a tab list or chat format reads a rank through `placeholders.resolve` without a
call; an unset prefix or suffix renders as empty text.

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
