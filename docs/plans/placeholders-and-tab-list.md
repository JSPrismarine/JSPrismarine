# Placeholders and the tab list

Started 2026-11-21. This plan is a working document: tick slices off, and add or reshape them as
the work teaches us things. It follows [JSPrismarine addons](first-party-addons.md), which built
the addon format, the installer and the TPS bar, and it reads groups from
[Permissions](permissions.md).

## Goal

Two addons and the module members they need.

Placeholders are tokens such as `{player:ping}` that any pack can provide and any pack can render.
A registry in `@jsprismarine/server` holds them, so a sidebar, a chat format or a tab list reads
the same values without talking to the pack that computes them. The `standard-placeholders` addon ships the
providers every server wants.

The tab list addon renames entries in the player list from a template, with a template per
player, per permission group, or for everyone. Other packs assign templates over script events.

What done looks like:

- `@jsprismarine/placeholders`, a second JSPrismarine module beside `@jsprismarine/server`,
  registers a namespace with a resolver and a list of keys, resolves a text for a player, and lists
  what is registered. A namespace belongs to the pack that registered it and goes when the pack's
  scripts stop, as boss bars do.
- `playerList.setDisplayName(player, name)` and `playerList.reset(player)` change what every
  client shows for a player in its player list, and nothing else.
- `addon install standard-placeholders` gives a server the `player`, `server` and `world` namespaces and
  `/placeholders list` and `/placeholders parse <text>`.
- `addon install tab-list`, then `/tablist format {player:name} &7{player:ping}ms`, and every
  entry in the pause menu's player list shows the name and ping, refreshed once a second.
- A pack sends `jsp_tablist:set_player` with a JSON message and that player's entry follows the
  template it named.

Out of scope for now:

- A push model where a provider announces a changed value. Consumers poll.
- Arguments on a token, such as `{player:ping|?}` for the text to show without a value. The
  syntax leaves room for them.
- Hiding players, ordering the list, or a header and footer. Bedrock's list shows a name, a skin
  and a platform, and the server controls only the name.
- Dependencies between addons in the installer. The tab list README says to install
  `standard-placeholders` first, and the addon warns on the console when the `player` namespace is
  missing.

## What we know

- `@jsprismarine/server` holds `jsprismarine`, `performance`, `getPing` and `bossBars`
  ([guide](../guide/jsprismarine-module.md)). Boss bars already model pack ownership and cleanup
  on reload, which the registry copies.
- `system.sendScriptEvent` runs `/scriptevent`, and every pack receives it on the next script
  flush. So a cross-pack call is asynchronous and one tick late, which is fine for commands between
  addons and too slow for a lookup inside a render.
- `playerListEntryOf` in `packages/prismarine/src/network/playerListEntry.ts` builds the entry
  from the player's login name. The session manager keeps the entries, and a joining player gets
  the whole map. A script's `nameTag` renames the actor above the head and never the list.
- `/scriptevent` typed on the console does not reach scripts yet
  ([#3238](https://github.com/JSPrismarine/JSPrismarine/issues/3238)), so the tab list's
  script-event API is for packs, and owners use `/tablist`.
- The script host fixes or records anything a script could read from the machine
  ([ADR 0021](../adr/0021-the-script-watchdog-counts-steps.md)), so no provider reads the wall
  clock.

## Shape

### The registry

```ts
interface PlaceholderProvider {
    keys: readonly string[];
    resolve(key: string, player?: Player): string | number | undefined;
}

interface Placeholders {
    register(namespace: string, provider: PlaceholderProvider): { unregister(): void };
    resolve(text: string, player?: Player): string;
    readonly namespaces: ReadonlyArray<{ namespace: string; keys: readonly string[] }>;
}
```

A token is `{namespace:key}`. Namespaces and keys are lowercase letters, digits and underscores,
starting with a letter. Any other text between braces is not a token and stays as written, so
there is no escape syntax. A token nobody provides stays as written too, so a missing provider is
visible rather than swallowed.

`register` throws for a malformed name, an empty key list, and a namespace another pack holds.
The server may register namespaces of its own, such as `perms`, through the same registry.

A resolver runs inside the caller's watchdog budget. A number renders through `String()`. A
resolver that returns `undefined`, or that needs a player when `resolve` got none, leaves its
token. A resolver that throws leaves its token, and the error reaches the content log once per
namespace rather than every tick.

### The standard providers

The `standard-placeholders` addon registers:

| Namespace | Keys                                                                         |
| --------- | ---------------------------------------------------------------------------- |
| `player`  | `name`, `ping`, `health`, `max_health`, `gamemode`, `dimension`, `x`, `y`, `z`, `level` |
| `server`  | `tps`, `mspt`, `online`, `max`, `version`, `uptime`                           |
| `world`   | `time`, `day`, `weather`                                                     |

`ping`, `tps` and `mspt` come from the module; the rest from `@minecraft/server`. `max` reads the
server's `max-players`, which needs a `jsprismarine.maxPlayers` value the module lacks today, so
slice 2 adds it beside `version`. `uptime` counts ticks since the world loaded, rendered as
`1d 2h 3m`.

`/placeholders list` prints each namespace with its keys. `/placeholders parse <text>` renders the
text for the sender. Both are operator commands.

### Templates

A template is a tree in the shape of Bedrock's rawtext, the format `/tellraw` and `/titleraw`
take, with a few more node kinds. The tab list is its first consumer, and a chat format or a
sidebar renders the same trees later. React was considered for this and set aside: an entry is one
line of text, so there is no tree to reconcile and no partial update, and an owner would need a
build step to write JSX for QuickJS.

```json
{
    "rawtext": [
        { "placeholder": "perms:prefix" },
        { "placeholder": "player:name" },
        { "if": "{player:ping} > 150", "then": [{ "text": " §c" }, { "placeholder": "player:ping" }], "else": [{ "text": " §7" }, { "placeholder": "player:ping" }] },
        { "animate": { "interval": 10, "frames": [[{ "text": "." }], [{ "text": ".." }], [{ "text": "..." }]] } },
        { "gradient": { "colors": ["#ff0000", "#0000ff"], "rawtext": [{ "text": "VIP" }] } }
    ]
}
```

The node kinds are `text`, `placeholder`, `if` with `then` and `else`, `animate` with `frames`
and an `interval` in ticks, `gradient` with a color list over its children, and rawtext's own
`translate`, `score` and `selector`. `render` gives plain text, which is all a player list entry
can carry, so `translate` renders as its key, `score` as the scoreboard value and `selector` as the
matching names. A consumer that can send rawtext to the client, such as a chat format, gets a
rawtext-producing render when one is needed. A condition
is a small expression over placeholders and literals: `==`, `!=`, `<`, `<=`, `>`, `>=`,
`contains` and `startsWith`, joined by `&&` and `||`, with parentheses. Two sides that both parse
as numbers compare as numbers, otherwise as text.

The shorthand string `{player:name} &7{player:ping}ms` parses into the same tree, so a command
stays terse and a file holds the structure. `&` color codes in shorthand become `§`.

```ts
interface Placeholders {
    // ...the registry above
    parse(shorthand: string): Template;
    render(template: Template | string, player?: Player): { text: string; nextChangeTick?: number };
}
```

`render` returns the text and, when the template holds an animation, the tick at which a frame
next changes the output. A consumer that refreshes on an interval also renders at that tick, so
an animation runs at its own pace and a template without one costs nothing between refreshes.

### The config member

An owner configures an addon in a file the server owns, not in `config/<module uuid>/variables.json`,
which needs the beta `server-admin` module and a folder named by a UUID.

```ts
interface AddonConfig {
    readonly value: unknown; // parsed JSON of addons/<name>.config.json, undefined when absent
    write(value: unknown): void;
    readonly afterEvents: { change: { subscribe(callback: (event: { value: unknown }) => void): void } };
}
```

`config` in `@jsprismarine/server` reads `addons/<name>.config.json` beside the addon's folder.
The server watches the file and raises `change` when it changes on disk. A file that fails to
parse keeps the last value and logs once. `write` rewrites the file, so an addon's command and the
owner's editor change the same thing. The addon validates the shape itself; the member only parses.

### The player list member

```ts
interface PlayerList {
    setDisplayName(player: Player, name: string): void;
    reset(player: Player): void;
}
```

`setDisplayName` stores the name on the player's entry in the session manager and broadcasts a
remove and an add for that entry, so every client and every later joiner shows it. An empty name
throws. The name a pack set reverts when that pack's scripts stop, and `reset` reverts it at once.
Chat and the name above the head keep the login name.

### The tab list addon

Templates live at three levels, and the first that exists wins: the player's own, the one for the
player's primary group, then the global one. The group comes from `{perms:primary_group}`, which
the server provides once the permissions work lands; until then, or when the namespace is absent,
the addon skips that tier and says so once on the console.

The addon renders each online player's template through `placeholders.render` every `interval`
ticks, 20 by default, and again at the `nextChangeTick` an animation reports, and calls
`setDisplayName` only when the rendered name differs from the last one it sent. A template that
renders to an empty string resets that player's entry to the login name, so the addon never passes
an empty name. Until an owner sets a template, the list is untouched.

The global and group templates and the interval live in `addons/tab-list.config.json`, read
through the config member, so an owner can write trees in an editor and `/tablist` writes the
same file:

```json
{
    "interval": 20,
    "templates": {
        "global": "{player:name} &7{player:ping}ms",
        "groups": {
            "admin": { "rawtext": [{ "text": "§c[Admin] " }, { "placeholder": "player:name" }] }
        }
    }
}
```

A template value is a shorthand string or a tree. `templates` is an object so a `worlds` sibling
can come later without a schema break. A player's template set by command lives in a dynamic
property on the player.

Commands, all operator level:

```text
/tablist format [template]      show or set the global template
/tablist reset                  clear the global template; group and player templates stay
/tablist group <group> <template>
/tablist group <group> remove
/tablist player <target> <template>
/tablist player <target> reset
/tablist show <target>          print what the target renders to now
```

A template typed in a command is shorthand. `/tablist format` and `/tablist group` write the
config file; `/tablist player` writes the player's dynamic property.

Other packs send script events with a JSON message:

| Id                        | Message                                      |
| ------------------------- | -------------------------------------------- |
| `jsp_tablist:set_global`  | `{ "template": "..." }`                       |
| `jsp_tablist:set_group`   | `{ "group": "vip", "template": "..." }`       |
| `jsp_tablist:clear_group` | `{ "group": "vip" }`                          |
| `jsp_tablist:set_player`  | `{ "player": "<name>", "template": "...", "persist": false }` |
| `jsp_tablist:clear_player`| `{ "player": "<name>" }`                     |

A `template` in a message is a shorthand string or a tree. `player` names an online player; a
message for a player who is not online is dropped with a console warning. `Player.id` is not used,
since on this server it is the entity id of one login. A player template set over the API is for
the session unless `persist` is true, in which case it lives in a dynamic property on the player.
Today the player save drops those properties, so a persisted template, and a template set with
`/tablist player`, would be lost at logout; slice 8 fixes the save first. With it, an AFK or vanish
addon can set and clear without leaving residue, and a ranks addon can set once and keep it.

## Verification

- Unit tests for the registry: token parsing, unknown tokens, ownership, duplicate namespaces,
  thrown resolvers and cleanup on reload.
- Unit tests for the renderer: each node kind, the condition grammar, the shorthand round trip,
  and the next-change tick of nested animations.
- Unit tests for the config member: read, write, a change on disk, and a file that fails to parse.
- Unit tests for the player list member: the entry in the session manager, the packets a client
  receives, what a late joiner gets, and the revert when the pack stops.
- Each addon's tests run its pack on a test server with a manual ticker, like the TPS bar's, and
  assert rendered names, template precedence, persistence across a restart, and the script-event
  API.
- The parity suite's `scripting.lifecycle` scenario records the new members as `intentional`.
- A client-e2e scenario installs both addons, sets a template and asserts the player list packet
  a real client receives, with a pause-menu screenshot for the pull request if the client can open
  that screen.

## Slices

1. [x] **The plan.** This document and its issues.
2. [x] [#3372](https://github.com/JSPrismarine/JSPrismarine/issues/3372) **The registry.** `placeholders` and `jsprismarine.maxPlayers` in `@jsprismarine/server`
       and `script-types`, the fact tables on the module page, and the parity row. In review the
       registry moved to a module of its own, `@jsprismarine/placeholders`, whose exports are the
       registry's members at top level, since `@jsprismarine/server` holds what reads or changes
       the running server and a feature with a type vocabulary of its own gets its own module. The registry is
       `ScriptPlaceholders` in the script host, which knows nothing of the engine: the runtime
       wraps a pack's resolver and names the pack as the owner, and `WorldScripts.placeholders`
       lets the server register under an owner of its own. A token's key must be in the provider's
       `keys`, so the list is what the registry answers. A player who left renders as no player.
3. [x] [#3373](https://github.com/JSPrismarine/JSPrismarine/issues/3373) **The placeholders addon.** The three namespaces, the two commands, the README, and its
       tests. The addon is `standard-placeholders`, so `addon install standard-placeholders` and
       `import('@jsprismarine/placeholders')` are not the same word for two things. `/placeholders` is one command whose first word is an enum, and a text with spaces
       is quoted, since a `String` parameter reads one word or a quoted phrase. `time` renders as
       the in-game clock and `uptime` counts from `worldLoad`, so a `/reload` starts it over.
4. [x] [#3374](https://github.com/JSPrismarine/JSPrismarine/issues/3374) **The player list member.** `playerList` in the module and `script-types`, the fact
       tables, and the parity row.
5. [ ] [#3375](https://github.com/JSPrismarine/JSPrismarine/issues/3375) **The tab list addon.** Templates at three levels from the config file, the commands,
       the script-event API, the README, its tests and the client-e2e scenario.
6. [x] [#3378](https://github.com/JSPrismarine/JSPrismarine/issues/3378) **The renderer.** `placeholders.parse` and `placeholders.render`, the node kinds, the
       condition grammar and the next-change tick. The renderer gives text, so the rawtext kinds
       render on the server: `translate` as its key, since the server has no language table,
       `score` from the scoreboard and `selector` as player names. A gradient colors each
       character with the nearest of Bedrock's `§` colors and ends with `§r`. A `with` on a
       `translate` is checked and dropped.
7. [ ] [#3379](https://github.com/JSPrismarine/JSPrismarine/issues/3379) **The config member.** `config` in the module, the file watch, and the writing-addons
       guide.
8. [x] [#3405](https://github.com/JSPrismarine/JSPrismarine/issues/3405) **Player dynamic properties survive logout.** The player record carries the actor's
       `persistentNbt`, so a property a script set is there at the next login and after a restart,
       as on BDS. A parity scenario covers it.

Slice 3 needs 2. Slices 6 and 7 need 2. Slice 5 needs 4, 6, 7 and 8, and reads `perms` when
permissions slice 5 exists. Slices 2 and 4 are independent, so two branches carry them in
parallel.

## Risks

- **Resolvers in the render loop.** A slow resolver slows every consumer, and the watchdog charges
  the consumer. The registry logs a resolver that throws, and the docs tell providers to read, not
  compute.
- **Long names.** The module passes a name through and the addon does not truncate, so an owner
  sees what the client makes of a long template. If a client misbehaves, the member gains a cap.
