---
title: Command reference
description: Every command the server answers, what it does, and the permission it needs.
group: Documents
category: Guides
---

# Command reference

JSPrismarine answers <!-- fact:commands.server -->66<!-- /fact --> commands: the vanilla set it implements, plus a few of its own
such as `/tps` and `/version`. The table below lists each one with its description, the permission
node that gates it in `permissions.json` and the permission level it needs. It is generated from the
commands the server registers, so it lists exactly what a server of this version accepts.

## Who can run a command

A player needs two things to run a command, and the table shows both.

The **permission** column is the node in `permissions.json`. A fresh `permissions.json` lets every
player <!-- fact:commands.defaults -->run `/help`, `/list`, `/me`, `/tps` and `/version`<!-- /fact -->, and grants every operator `*`, which covers
every node. To let a player run something else, add its node to their entry in `players`, or to
`defaultPermissions` to give it to everyone. A node ending in `.*` grants a whole scope, so
`minecraft.command.*` grants every vanilla command.

The **level** column is the command's permission level, which follows Java Edition. Everyone else
runs at level 0, an operator at 4 and the console at 5, so a command at level 1 or above needs an
operator even when a permission node allows it. A command at level 5 runs on the console only: no
player sees it, and an operator who types it is told it needs a higher level. The **granted to**
column puts the two together for a fresh server: who can run the command before you change
anything.

For how the server parses commands, what differs from Bedrock Edition and how to run functions from
a datapack, see [Commands and functions](../data-driven/commands.md).

## Addons

`addon` installs, updates, lists and removes addons, the optional behavior packs JSPrismarine and
other repositories publish. It runs on the console only, typed on the terminal or sent through the
remote console, so nobody adds code to a server from inside the game.

| Subcommand                                         | What it does                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `addon list`                                       | Lists each addon, its version and where it came from.                |
| `addon install <addon> [as <name>]`                | Installs the newest version the addon allows and loads it.           |
| `addon update [name]`                              | Moves each addon, or the one named, to the newest version in range. |
| `addon remove <name>`                              | Removes the addon and unloads it.                                    |
| `addon sync`                                       | Installs and removes addons until the folder matches the two files. |

`<addon>` takes one of these forms:

- `tps-bar`: an addon from <!-- fact:addons.defaultSource -->`JSPrismarine/JSPrismarine`<!-- /fact -->, JSPrismarine's own source.
- `owner/repo/name`: an addon from another GitHub repository that publishes an index on its
  <!-- fact:addons.releaseTag -->`addons`<!-- /fact --> release.
- Either of those followed by `@` and a range: `tps-bar@^1.0.0` takes any `1.x.x` from `1.0.0` on,
  `@~1.2.0` takes patches of `1.2`, `@1.2.3` takes that version only and `@*` takes any. Without a
  range, the install records `^` and the version it installed.
- An `https:` URL of an `.mcpack`. No index lists it, so the console says that no hash checked the
  download, and the lock records the hash of what was downloaded.
- A path that starts with `./`, `../` or `/`, or ends in `.mcpack`. A folder is linked rather than
  copied, so an edit to it shows after `/reload`.

The server's folder holds what was asked for and what it resolved to, beside `config.json`:
<!-- fact:addons.requestFile -->`addons.json`<!-- /fact --> keys each addon by its local name with the source and range
it came from, and you may edit it by hand. <!-- fact:addons.lockFile -->`addons.lock.json`<!-- /fact --> records the version,
URL and SHA-256 each one installed, and only the command writes it. The local name is also the
addon's folder under <!-- fact:addons.directory -->`addons/`<!-- /fact -->, so two repositories' addons of the same name
install side by side when the second takes `as <name>`.

`addon update` changes a locked version. So does a sync after you edit `addons.json`: an entry
whose source, name or range no longer allows its lock resolves again and locks the newest version
it allows, so changing `^1.0.0` to `^2.0.0` moves the addon to `2.x` on the next sync or start.
At startup, and on `addon sync`, the server installs a locked addon whose folder is missing from
its locked URL and refuses a download whose hash is no longer the one locked. It resolves and
locks an entry of `addons.json` with no lock, and removes a locked addon `addons.json` no longer
names. A server copied to another machine without its
`addons/` folder gets the same addons back, except one installed from a path outside the server's
folder: copy that folder too, at the same path, or change its `path` in `addons.json` to where the
folder is now and run `addon sync`.

An install or a removal reloads the behavior pack scripts with the new list of packs, so no restart
is needed for scripts. A pack that also has blocks, items, entities or other data loads that part
at the next restart, and the console says so.

## Every command

Aliases are listed after the command they run; `/tp` parses the same arguments as `/teleport` and
does the same thing.

<!-- fact:commands.reference.table -->
| Command               | Description                                                                                               | Permission                        | Level | Granted to  |
| --------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------- | ----- | ----------- |
| `/addon`              | Installs, updates, lists and removes addons. Only the console runs it.                                    | `jsprismarine.command.addon`      | 5     | The console |
| `/ban`                | Ban a player.                                                                                             | `minecraft.command.ban`           | 2     | Operators   |
| `/camerashake`        | Applies shaking to the players' camera.                                                                   | `minecraft.command.camerashake`   | 1     | Operators   |
| `/clear`              | Removes items from inventories.                                                                           | `minecraft.command.clear`         | 1     | Operators   |
| `/clone`              | Copies a region of blocks.                                                                                | `minecraft.command.clone`         | 1     | Operators   |
| `/damage`             | Applies damage to entities.                                                                               | `minecraft.command.damage`        | 1     | Operators   |
| `/daylock`            | Locks and unlocks the day-night cycle.                                                                    | `minecraft.command.daylock`       | 1     | Operators   |
| `/debug`              | Debug output.                                                                                             | `jsprismarine.command.debug`      | 4     | Operators   |
| `/deop`               | Revokes operator status.                                                                                  | `minecraft.command.deop`          | 4     | Operators   |
| `/difficulty`         | Changes the difficulty.                                                                                   | `minecraft.command.difficulty`    | 1     | Operators   |
| `/effect`             | Adds or removes status effects.                                                                           | `minecraft.command.effect`        | 1     | Operators   |
| `/enchant`            | Enchants a held item.                                                                                     | `minecraft.command.enchant`       | 1     | Operators   |
| `/execute`            | Runs a command with a changed source, position, rotation or dimension.                                    | `minecraft.command.execute`       | 1     | Operators   |
| `/fill`               | Fills a region with a block.                                                                              | `minecraft.command.fill`          | 1     | Operators   |
| `/fog`                | Adds or removes fog settings.                                                                             | `minecraft.command.fog`           | 1     | Operators   |
| `/function`           | Runs an mcfunction or a function tag.                                                                     | `minecraft.command.function`      | 1     | Operators   |
| `/gamemode`           | Changes a player's game mode.                                                                             | `minecraft.command.gamemode`      | 1     | Operators   |
| `/gamerule`           | Reads and writes gamerules.                                                                               | `minecraft.command.gamerule`      | 1     | Operators   |
| `/gametest`           | Interacts with gametest.                                                                                  | `minecraft.command.gametest`      | 2     | Operators   |
| `/give`               | Gives an item to players.                                                                                 | `minecraft.command.give`          | 1     | Operators   |
| `/help`, `/?`         | Shows paged command listings and command syntax.                                                          | `minecraft.command.help`          | 0     | Everyone    |
| `/kick`               | Removes a player from the server.                                                                         | `minecraft.command.kick`          | 2     | Operators   |
| `/kill`               | Kills entities.                                                                                           | `minecraft.command.kill`          | 1     | Operators   |
| `/list`               | Lists the players online.                                                                                 | `minecraft.command.list`          | 0     | Everyone    |
| `/locate`             | Finds the nearest structure, biome or point of interest.                                                  | `minecraft.command.locate`        | 1     | Operators   |
| `/loot`               | Runs a loot table.                                                                                        | `minecraft.command.loot`          | 1     | Operators   |
| `/me`                 | Sends an action message.                                                                                  | `minecraft.command.me`            | 0     | Everyone    |
| `/op`                 | Grants operator status.                                                                                   | `minecraft.command.op`            | 4     | Operators   |
| `/pardon`             | Pardon a player.                                                                                          | `minecraft.command.pardon`        | 2     | Operators   |
| `/particle`           | Spawns particles.                                                                                         | `minecraft.command.particle`      | 1     | Operators   |
| `/playanimation`      | Makes one or more entities play a one-off animation.                                                      | `minecraft.command.playanimation` | 1     | Operators   |
| `/playsound`          | Plays a sound.                                                                                            | `minecraft.command.playsound`     | 1     | Operators   |
| `/random`             | Draws from a reproducible random sequence.                                                                | `minecraft.command.random`        | 0     | Operators   |
| `/recipe`             | Unlocks or locks recipes.                                                                                 | `minecraft.command.recipe`        | 1     | Operators   |
| `/reload`             | Reloads the server data.                                                                                  | `minecraft.command.reload`        | 2     | Operators   |
| `/replaceitem`        | Replaces items in inventories.                                                                            | `minecraft.command.replaceitem`   | 1     | Operators   |
| `/return`             | Ends the running function and sets what it returns.                                                       | `minecraft.command.return`        | 1     | Operators   |
| `/say`                | Sends a message to everyone.                                                                              | `minecraft.command.say`           | 1     | Operators   |
| `/schedule`           | Queues a function for later.                                                                              | `minecraft.command.schedule`      | 1     | Operators   |
| `/scoreboard`         | Tracks and displays scores.                                                                               | `minecraft.command.scoreboard`    | 1     | Operators   |
| `/script`             | Script debugger commands.                                                                                 | `minecraft.command.script`        | 2     | Operators   |
| `/scriptevent`        | Sends an event with an id and a message to the scripts of behavior packs.                                 | `minecraft.command.scriptevent`   | 1     | Operators   |
| `/setblock`           | Places one block.                                                                                         | `minecraft.command.setblock`      | 1     | Operators   |
| `/setworldspawn`      | Moves the world spawn.                                                                                    | `minecraft.command.setworldspawn` | 1     | Operators   |
| `/spawnpoint`         | Moves a player spawn point.                                                                               | `minecraft.command.spawnpoint`    | 1     | Operators   |
| `/spreadplayers`      | Spreads players around a point.                                                                           | `minecraft.command.spreadplayers` | 1     | Operators   |
| `/stop`               | Stops the server.                                                                                         | `minecraft.command.stop`          | 4     | Operators   |
| `/stopsound`          | Stops a sound.                                                                                            | `minecraft.command.stopsound`     | 1     | Operators   |
| `/summon`             | Summons an entity.                                                                                        | `minecraft.command.summon`        | 1     | Operators   |
| `/tag`                | Adds, removes and lists entity tags.                                                                      | `minecraft.command.tag`           | 1     | Operators   |
| `/teleport`, `/tp`    | Teleports entities.                                                                                       | `minecraft.command.teleport`      | 1     | Operators   |
| `/tell`, `/msg`, `/w` | Sends a private message.                                                                                  | `minecraft.command.tell`          | 0     | Operators   |
| `/tellraw`            | Sends a rawtext message.                                                                                  | `minecraft.command.tellraw`       | 1     | Operators   |
| `/testfor`            | Counts entities matching specified conditions.                                                            | `minecraft.command.testfor`       | 1     | Operators   |
| `/testforblock`       | Tests whether a certain block is in a specific location.                                                  | `minecraft.command.testforblock`  | 1     | Operators   |
| `/testforblocks`      | Tests whether the blocks in two regions match.                                                            | `minecraft.command.testforblocks` | 1     | Operators   |
| `/tick`               | Queries or changes the tick rate, freezes the world, steps it or sprints.                                 | `minecraft.command.tick`          | 2     | Operators   |
| `/tickingarea`        | Add, remove, or list ticking areas.                                                                       | `minecraft.command.tickingarea`   | 1     | Operators   |
| `/time`               | Changes or queries the world time.                                                                        | `minecraft.command.time`          | 1     | Operators   |
| `/title`              | Shows a title, subtitle or action bar.                                                                    | `minecraft.command.title`         | 1     | Operators   |
| `/titleraw`           | Controls screen titles with JSON messages.                                                                | `minecraft.command.titleraw`      | 1     | Operators   |
| `/tps`                | This command will show TPS (ticks per second) averages of your server from the last 1, 5, and 15 minutes. | `jsprismarine.command.tps`        | 0     | Everyone    |
| `/transfer`           | Sends players to another server.                                                                          | `minecraft.command.transfer`      | 2     | Operators   |
| `/version`, `/about`  | Displays general server information.                                                                      | `jsprismarine.command.version`    | 0     | Everyone    |
| `/weather`            | Changes the weather.                                                                                      | `minecraft.command.weather`       | 1     | Operators   |
| `/xp`, `/experience`  | Adds, sets or queries experience.                                                                         | `minecraft.command.xp`            | 1     | Operators   |
<!-- /fact -->
