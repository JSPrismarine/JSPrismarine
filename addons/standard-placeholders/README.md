# Standard Placeholders

Tokens such as `{player:ping}` that other addons render: a tab list, a sidebar or a chat format
shows the same values without computing them itself. This addon provides the standard `player`,
`server` and `world` namespaces through `@jsprismarine/placeholders`, and `/placeholders` to list and
try them.

## The placeholders

A token is `{namespace:key}`. `/placeholders parse` renders through the registry every addon
shares, so a token another addon provides, such as an economy's `{economy:balance}`, renders too.
A token no addon provides, or whose key its provider does not declare, stays as written, and so
does one its provider cannot answer, such as `{player:ping}` before the player's connection has a
sample or any `player` token in a text rendered for no player. `{world:weather}` is known once the weather has
changed since the scripts started, because the Script API that a pack can use without the Beta
APIs experiment has no way to read it before then
([#3388](https://github.com/JSPrismarine/JSPrismarine/issues/3388)).

<!-- fact:addons.standard-placeholders.keys -->
| Token                 | What it renders                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{player:name}`       | The player's name.                                                                                                                                                     |
| `{player:ping}`       | The player's round trip time in milliseconds, rounded. Left as written until the connection has a sample.                                                              |
| `{player:health}`     | The player's health, rounded to a whole number.                                                                                                                        |
| `{player:max_health}` | The most health the player can have.                                                                                                                                   |
| `{player:gamemode}`   | The player's game mode: `Survival`, `Creative`, `Adventure` or `Spectator`.                                                                                            |
| `{player:dimension}`  | The player's dimension without its `minecraft:` prefix, such as `overworld`.                                                                                           |
| `{player:x}`          | The player's x coordinate, rounded down.                                                                                                                               |
| `{player:y}`          | The player's y coordinate, rounded down.                                                                                                                               |
| `{player:z}`          | The player's z coordinate, rounded down.                                                                                                                               |
| `{player:level}`      | The player's experience level.                                                                                                                                         |
| `{server:tps}`        | Ticks per second over the last second, with one decimal.                                                                                                               |
| `{server:mspt}`       | The milliseconds a tick's work has taken lately, with one decimal.                                                                                                     |
| `{server:online}`     | How many players are online.                                                                                                                                           |
| `{server:max}`        | How many players may be online at once.                                                                                                                                |
| `{server:version}`    | The JSPrismarine version.                                                                                                                                              |
| `{server:uptime}`     | How long the scripts have run, such as `1d 2h 3m`. A `/reload` starts it over.                                                                                         |
| `{world:time}`        | The time of day as a 24-hour clock, such as `06:00` at a day's start.                                                                                                  |
| `{world:day}`         | How many days the world has seen.                                                                                                                                      |
| `{world:weather}`     | The weather in the player's dimension, or the Overworld's: `Clear`, `Rain` or `Thunder`. Left as written until the weather has changed once since the scripts started. |
<!-- /fact -->

## Using it

Both commands are for operators. `/placeholders list` prints every namespace that is registered
with its keys, this addon's and any other addon's. `/placeholders parse <text>` renders a text for
you, so you can try a template before you give it to another addon. Quote a text with spaces:

```text
/placeholders parse "{player:name} is at {player:x} {player:y} {player:z}, {server:online}/{server:max} online"
```

From the console the text renders for no player, so its `player` tokens stay as written.

Other addons render through `resolve` of `@jsprismarine/placeholders`, described in
[the JSPrismarine script module](../../docs/guide/jsprismarine-module.md#the-placeholders-module),
and can register namespaces of their own beside these.

## Installing it

From the server console:

```text
addon install standard-placeholders
```

It needs JSPrismarine <!-- fact:addons.standard-placeholders.minServer -->0.23.0<!-- /fact --> or newer. The
pack also loads on Bedrock Dedicated Server, where `/placeholders` says it needs JSPrismarine,
since only JSPrismarine has the registry.
