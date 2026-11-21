# Multiverse

Creates worlds and moves players between them, each world with its own game mode and access. It
brings the core of [Multiverse-Core](https://www.spigotmc.org/resources/multiverse-core.390/) from
Java Edition servers to JSPrismarine.

## Worlds

A world is one of the server's levels: a world of its own, with an Overworld, a Nether and an End,
its own spawn, and each player's inventory, health and position in it
([Managing worlds while the server runs](../../docs/guide/running.md#managing-worlds-while-the-server-runs)
describes them). The level `level-name` names is the one players join first. `/mv create` makes a
new level, `/mv unload` detaches one and keeps its files, and `/mv load` brings it back, as
`/world` does. A player moving to another world leaves their inventory behind and picks up the one
they had there, unless the server's `player-data-groups` share it.

Multiverse runs in every level, so `/mv` acts in the world the player who types it is in.

## Commands

`/mv <action>` does everything. Anyone may run
<!-- fact:addons.multiverse.playerActions -->`list`, `info`, `tp`, `spawn`, `who` and `coords`<!-- /fact -->,
and operators and the console also
<!-- fact:addons.multiverse.operatorActions -->`create`, `load`, `unload`, `setspawn` and `modify`<!-- /fact -->.

| Command | What it does |
| --- | --- |
| `/mv list` | Lists the worlds and how many players each has. Operators also see the unloaded ones. |
| `/mv info <world>` | Shows a world's rules and its UUID. |
| `/mv tp <world> [player]` | Sends you, or for an operator another player in your world, to a world's spawn. |
| `/mv spawn` | Sends you to the spawn of the world you are in. |
| `/mv who [world]` | Lists the players in each world, or in one. |
| `/mv coords` | Shows the world and dimension you are in and your position. |
| `/mv create <name> [preset] [seed]` | Creates a world, `minecraft:normal` unless you name another preset such as `minecraft:flat`. A name is 1 to 64 letters, digits, `_` or `-`. |
| `/mv load <world>` | Loads an unloaded world again. |
| `/mv unload <world>` | Saves a world, sends its players to the world players join first, and unloads it. Its files stay. |
| `/mv setspawn` | Makes where you stand the spawn of the world you are in. Stand in its Overworld. |
| `/mv modify <world> <property> <value>` | Changes one rule of a world. |

`create`, `load` and `unload` take a moment. The command answers at once, and the player who ran
it, or the console's log, hears when it is done.

A hidden world is left out of `/mv list` for players, and only operators can enter it. The player
limit and the game mode bind players who are not operators.

## Rules

`/mv modify` sets these properties, and `none` clears one:

<!-- fact:addons.multiverse.properties -->
| Property       | Value                                            |
| -------------- | ------------------------------------------------ |
| `alias`        | a name to show for the world, or none            |
| `gamemode`     | survival, creative, adventure, spectator or none |
| `hidden`       | true or false                                    |
| `playerlimit`  | a whole number of players, or none               |
| `respawnworld` | a world, or none                                 |
<!-- /fact -->

- `gamemode` is the mode a player is put in when they join the server in the world or arrive
  there.
- `playerlimit` caps how many players `/mv tp` lets in.
- `respawnworld` is the world a player who dies in this one respawns in, at its spawn, when they
  have no bed or respawn anchor. Without it they respawn in the world they died in.

The rules live in `addons/multiverse.config.json` beside the addon, keyed by each level's UUID,
which `/mv info` shows. A UUID stays the same when a level is renamed, so the rules follow it.
You can edit the file by hand: Multiverse reads a change without a restart, and the console says
which fields it could not read.

```json
{
    "worlds": {
        "6f1c9d2a-3b4e-4f5a-8b6c-7d8e9f0a1b2c": { "alias": "Creative", "gamemode": "creative" },
        "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d": {
            "hidden": true,
            "playerLimit": 20,
            "respawnWorld": "6f1c9d2a-3b4e-4f5a-8b6c-7d8e9f0a1b2c"
        }
    }
}
```

## Placeholders

Where a pack renders placeholders, such as the [tab list](../tab-list/README.md),
`{multiverse:world}` is the name of the player's world and `{multiverse:alias}` its alias.

## Installing it

From the server console:

```text
addon install multiverse
```

It needs JSPrismarine <!-- fact:addons.multiverse.minServer -->0.25.0<!-- /fact --> or newer,
which manages levels while it runs. The pack also loads on Bedrock Dedicated Server, which has one
world, and `/mv` says it needs JSPrismarine there.

## What it cannot do

Multiverse-Core also deletes, copies and regenerates worlds, and turns PvP off per world. A world
unloaded here keeps its files, and the stable Script API cannot cancel damage, so this addon does
none of those.
