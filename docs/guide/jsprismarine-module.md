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
runs. `performance`, `getPing`, `bossBars` and `playerList` reach the running server: each
property of `performance` reads the server when the script reads it, so a script that wants the
numbers for the current tick reads them again.

<!-- fact:scripting.jspModule.table -->
| Member                                    | Type                | What it is                                                                                                                                                                                   |
| ----------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsprismarine`                            | object              | The server the pack runs on.                                                                                                                                                                 |
| `jsprismarine.name`                       | `"JSPrismarine"`    | The server software, always `JSPrismarine`.                                                                                                                                                  |
| `jsprismarine.version`                    | string              | The JSPrismarine version, such as `0.22.0`, without a leading `v`.                                                                                                                           |
| `jsprismarine.minecraftVersion`           | string              | The newest Minecraft Bedrock release the server speaks, the one it advertises.                                                                                                               |
| `jsprismarine.protocolVersion`            | number              | The Bedrock network protocol version of `minecraftVersion`.                                                                                                                                  |
| `performance`                             | object              | How fast the server ticks. Each property reads the server when the script reads it.                                                                                                          |
| `performance.tps`                         | number              | Ticks per second over the last second. The server aims for 20, and runs above it while it catches up.                                                                                        |
| `performance.tpsAverages`                 | `readonly number[]` | Ticks per second averaged over the windows `/tps` reports, shortest first.                                                                                                                   |
| `performance.lastTickMs`                  | number              | How long the last tick's work took, in milliseconds, without the wait before the next tick. Zero before the first tick.                                                                      |
| `performance.averageTickMs`               | number              | How long a tick's work has taken lately, in milliseconds, as a moving average over the recent ticks. Zero before the first tick.                                                             |
| `getPing(player)`                         | function            | The player's round trip time in milliseconds, or `undefined` while their connection has no sample, after they leave, or when their transport measures none.                                  |
| `bossBars`                                | object              | Boss bars on one player's screen. A bar belongs to the pack that showed it and goes away when the player leaves or the pack's scripts stop, as on `/reload`.                                 |
| `bossBars.show(player, options)`          | function            | Shows a boss bar to one player. A player sees the bar shown last, and the one before it again once that one is hidden. A bar for a player who left is never valid.                           |
| `playerList`                              | object              | The player list every client shows, in the pause menu. A name a pack sets there reverts when the pack's scripts stop, as on `/reload`. Chat and the name above the head keep the login name. |
| `playerList.setDisplayName(player, name)` | function            | Changes the name every client, and every later joiner, shows for the player in its player list, and nothing else. Throws for an empty name. Does nothing for a player who left.              |
| `playerList.reset(player)`                | function            | Gives the player's entry its login name back, at once rather than when the scripts stop.                                                                                                     |
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

## Rename a player in the player list

`playerList.setDisplayName` changes the name every client shows for a player in the pause menu's
player list, and nothing else: chat and the name above the head keep the login name. A player who
joins later sees the name too. This one shows each player's ping after their name, refreshed once
a second, and sends a name only when it changed:

```js
import { system, world } from '@minecraft/server';

world.afterEvents.worldLoad.subscribe(async () => {
    const jsp = await loadJsprismarine();
    if (jsp === undefined || !('playerList' in jsp)) return;
    const shown = new Map();
    system.runInterval(() => {
        for (const player of world.getAllPlayers()) {
            const name = `${player.name} §7${jsp.getPing(player) ?? '?'}ms`;
            if (shown.get(player.id) === name) continue;
            shown.set(player.id, name);
            jsp.playerList.setDisplayName(player, name);
        }
    }, 20);
});
```

An empty name throws a `TypeError`. `playerList.reset(player)` gives the entry its login name
back at once, and every name the scripts set reverts when they stop, on `/reload` or at shutdown.
A name set for a player who left changes nothing, and a player who rejoins starts with their login
name again.

Later JSPrismarine versions add members. To use one that an older server may lack, check for it
before you call it, the same way you check for the module:
## The placeholders module

JSPrismarine has a second module, `@jsprismarine/placeholders`, loaded the same way as
`@jsprismarine/server`: left out of the manifest, with one `import()` inside `try`, so the pack
still runs on BDS, where the import rejects.

```js
/** The placeholder registry, or undefined on a server without it. */
const loadPlaceholders = async () => {
    try {
        return await import('@jsprismarine/placeholders');
    } catch {
        return undefined;
    }
};
```

The split follows one rule. `@jsprismarine/server` holds the members that read or change the
running server and its players: its version, how fast it ticks, a player's ping, a boss bar on a
player's screen. A feature with a type vocabulary of its own, one that would stand as a library by
itself, gets its own `@jsprismarine/<name>` module, and the placeholders are the first. An import
of any other `@jsprismarine/` name rejects with the message BDS gives for an unknown module.

A placeholder is a token such as `{player:ping}` in a text. The module is the registry every pack
shares: one pack registers a namespace with the keys it answers, and any pack renders a text
through `resolve`, so a sidebar, a chat format or a tab list shows the same values without talking
to the pack that computes them. The
[standard placeholders addon](../../addons/standard-placeholders/README.md) registers the `player`,
`server` and `world` namespaces most servers want.

<!-- fact:scripting.placeholdersModule.table -->
| Member                          | Type     | What it is                                                                                                                                                                                                                                   |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register(namespace, provider)` | function | Registers a namespace. Throws a `TypeError` for a namespace or key that is not lowercase letters, digits and underscores starting with a letter, or for a provider with no keys, and an `Error` for a namespace that is registered already.  |
| `resolve(text, player)`         | function | Replaces each `{namespace:key}` in the text with its value, for the player when one is given. A token nobody provides, or whose provider gives `undefined` or throws, stays as written, and so does any other text between braces.           |
| `namespaces()`                  | function | Every registered namespace with its keys, oldest first, as a new frozen list each call.                                                                                                                                                      |
| `parse(shorthand)`              | function | Parses the shorthand `{player:name} &7{player:ping}ms` into a template: each token a `placeholder` node, the rest `text` nodes, and `&` before a format code `§`.                                                                            |
| `render(template, player)`      | function | Renders a template, or a shorthand string, for the player when one is given: the text, and the tick an animation in it next changes the text. Throws a `TypeError` for a node the renderer does not know or a condition that does not parse. |
<!-- /fact -->

Its types, which `@jsprismarine/script-types` declares too. `Player` is `@jsprismarine/server`'s:

<!-- fact:scripting.placeholdersModule.types -->
| Type                                       | Kind                      | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlaceholderProvider`                      | interface                 | What a pack registers for a namespace: the keys it answers, and the function that answers them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `PlaceholderProvider.keys`                 | `readonly string[]`       | The keys the provider answers, each lowercase letters, digits and underscores starting with a letter. A token with another key stays as written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `PlaceholderProvider.resolve(key, player)` | function                  | The value of one key, for the player when the text is rendered for one. A number renders through `String()`. `undefined` leaves the token as written, and so does a throw, which the content log reports once per namespace. It runs inside the budget of the script that renders.                                                                                                                                                                                                                                                                                                                                                                            |
| `PlaceholderRegistration`                  | interface                 | A namespace a pack registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PlaceholderRegistration.unregister()`     | function                  | Takes the namespace out of the registry, so its tokens stay as written. A pack's namespaces go on their own when its scripts stop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `PlaceholderNamespace`                     | interface                 | One registered namespace.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `PlaceholderNamespace.namespace`           | string                    | Its name, the part of a token before the colon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `PlaceholderNamespace.keys`                | `readonly string[]`       | The keys its provider answers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Template`                                 | interface                 | A template: a tree in the shape of Bedrock's rawtext, the format `/tellraw` takes, with a few more node kinds. `placeholders.parse` makes one from shorthand, and a file or a script can hold one.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Template.rawtext`                         | `readonly TemplateNode[]` | The nodes, rendered in order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `TemplateNode`                             | type                      | One node of a template: a `text`; a `placeholder` named `namespace:key`; an `if` with a condition over placeholders and literals (`==`, `!=`, `<`, `<=`, `>`, `>=`, `contains`, `startsWith`, joined by `&&` and `||`, with parentheses; two sides that both parse as numbers compare as numbers) and its `then` and `else` nodes; an `animate` with `frames` and an `interval` in ticks; a `gradient` with `#rrggbb` colors over its `rawtext`, each character in the nearest `§` color; and rawtext's `translate`, which renders as its key, `score`, which reads the scoreboard, and `selector`, which reads player names. A bare string is a `text` node. |
| `RenderedTemplate`                         | interface                 | What `placeholders.render` gave.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `RenderedTemplate.text`                    | string                    | The rendered text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `RenderedTemplate.nextChangeTick?`         | number                    | The tick at which an animation in the template next changes the text, so a consumer that refreshes on an interval renders again then. Absent when the template holds no animation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
<!-- /fact -->

```js
import { world } from '@minecraft/server';

world.afterEvents.worldLoad.subscribe(async () => {
    const [jsp, placeholders] = await Promise.all([loadJsprismarine(), loadPlaceholders()]);
    if (jsp === undefined || placeholders === undefined) return;
    placeholders.register('demo', {
        keys: ['name', 'ping', 'slots'],
        resolve(key, player) {
            if (key === 'slots') return jsp.jsprismarine.maxPlayers;
            if (player === undefined) return undefined;
            return key === 'name' ? player.name : jsp.getPing(player);
        }
    });
});

// Each player who spawns in, the ones online at `worldLoad` included, gets the rendered line.
world.afterEvents.playerSpawn.subscribe(async ({ player, initialSpawn }) => {
    const placeholders = await loadPlaceholders();
    if (!initialSpawn || placeholders === undefined) return;
    player.sendMessage(placeholders.resolve('{demo:name}, your ping is {demo:ping}ms', player));
});
```

A namespace and a key match <!-- fact:scripting.placeholderName -->`[a-z][a-z0-9_]*`<!-- /fact -->: lowercase
letters, digits and underscores, starting with a letter. Any other text between braces is not a
token and stays as written, so there is no escape syntax. A
token nobody provides stays as written too, so a missing addon shows in the text rather than
disappearing from it. The same goes for a key whose resolver gives `undefined`, such as `name`
above when the text is rendered for no player, and for one whose resolver throws: the content log
reports the first throw of each namespace, and the token stays. The watchdog's errors are the
exception: a resolver that runs out of the budget ends the render, as it would end any callback.

A resolver runs inside the budget of the script that renders, so read a value rather than compute
one. A number renders through `String()`. `register` throws a `TypeError` for a malformed name or
a provider without keys, and an `Error` for a namespace that is registered already; `namespaces()`
lists the names in use with their keys. A namespace belongs to the pack that registered it:
`unregister` on the returned registration ends it, and every namespace of a pack goes when its
scripts stop, as on `/reload`.

## Render a template

A template is a tree in the shape of Bedrock's rawtext, the format `/tellraw` takes, with a few
more node kinds, so an owner can write one in a file and a command can take the shorthand.
`placeholders.parse` turns the shorthand `{player:name} &7{player:ping}ms` into a tree, and
`placeholders.render` renders a tree, or the shorthand itself, for a player:

```js
const template = {
    rawtext: [
        { placeholder: 'player:name' },
        { if: '{player:ping} > 150', then: [' §c', { placeholder: 'player:ping' }], else: [' §7', { placeholder: 'player:ping' }] },
        { animate: { interval: 10, frames: [['.'], ['..'], ['...']] } },
        { gradient: { colors: ['#ff5555', '#5555ff'], rawtext: ['VIP'] } }
    ]
};
const { text, nextChangeTick } = placeholders.render(template, player);
```

The node kinds are `text` (a bare string is one), `placeholder`, `if` with `then` and `else`,
`animate` with `frames` and an `interval` in ticks, `gradient` with `#rrggbb` colors over its
`rawtext`, and rawtext's own `translate`, `score` and `selector`. The renderer gives text, so it
renders those three on the server: `translate` as its key, `score` from the scoreboard, and
`selector` as the names of the entities the server's selector grammar matches, so `@a[tag=vip]`
works. A condition compares placeholders and literals with
<!-- fact:scripting.conditionOperators -->`==`, `!=`, `<`, `<=`, `>`, `>=`, `contains` and `startsWith`<!-- /fact -->, joined by
<!-- fact:scripting.conditionJoiners -->`&&` and `||`<!-- /fact --> with parentheses; two sides that both parse
as numbers compare as numbers, otherwise as text. A gradient colors each character with the nearest of Bedrock's `§` colors and ends with
`§r`. `render` throws a `TypeError` for a node it does not know or a condition that does not
parse, and says where in the tree.

`nextChangeTick` is the tick at which an animation in the template next changes the text, the
soonest across every animation with more than one frame the render reached. A consumer that refreshes on an interval
renders again at that tick too, so an animation runs at its own pace and a template without one
costs nothing between refreshes.

Later JSPrismarine versions add members. To use one that an older server may lack, check for it
before you call it, the same way you check for the module:

```js
const jsp = await loadJsprismarine();
if (jsp !== undefined && 'someNewMember' in jsp) {
    // JSPrismarine new enough to have it
}
```

## Types for TypeScript

`@jsprismarine/script-types` holds the declarations of both modules. The npm name
`@jsprismarine/server` belongs to the server package, so the declarations package has its own name
and declares the modules inside. Add it to `types` in your `tsconfig.json`, and
`import('@jsprismarine/server')` and `import('@jsprismarine/placeholders')` are typed:

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
