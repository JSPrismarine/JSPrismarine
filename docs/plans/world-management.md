# World management

Started 2026-11-21. This plan is a working document: tick slices off, and add or reshape them as
the work teaches us things. [ADR 0029](../adr/0029-worlds-are-levels-the-server-manages.md)
records the model.

## Goal

An owner creates, attaches, detaches and lists worlds while the server runs, and players move
between them the way they move between dimensions today. A world is a level. The server owns
each level's lifecycle, and commands, scripts and addons go through one API to reach it. The
Multiverse addon then becomes a thin layer of commands and per-world rules over that API.

What done looks like:

- Every level has a UUID in its save, and every custom dimension a UUID mapped to a Bedrock
  dimension number that the save keeps and never gives to another dimension.
- `worlds` in the config lists the levels the owner declares. A level created at runtime is
  recorded in `levels.json`, which the server owns, never in the config. Detached levels may share
  a name; attached ones may not.
- A level is detached, attaching, attached or detaching, and the kernel announces each change.
  Detaching a level moves its players out, stops its scripts, saves it and keeps its files.
- `/world list | create | attach | detach | tp` manages levels, and `@jsprismarine/server`
  exposes the same operations to scripts.
- Moving a player to another level gives the client that level's game rules, clock, weather and
  custom dimensions, and the player's record follows the level's, or the group's, player data.
- No code reaches for "the default world" when it means the world of the player, command or block
  in hand.

Out of scope for now:

- Deleting a level's files. Detaching keeps them; deleting can come as its own command later.
- Linking portals between levels, as Multiverse-NetherPortals does.
- Levels in more than one process.

## Where `WorldManager` is today

`packages/prismarine/src/world/WorldManager.ts`, as of `72c76180eec`:

- `loadLevel(worldData, folderName)` takes a config entry, and `prepareLevel` writes a normalized
  entry back into the config. A level has no existence apart from its entry.
- A level's identity is its config key, matched case-insensitively by `getLevel` and exactly by
  `levelOf` and `getWorldByDimension`. Script slots, `closeLevel` and every caller key on it.
- Fourteen files call `getDefaultWorld()` or `getDefaultLevel()`, and `levelOf(undefined)` means
  the default level. [#3641](https://github.com/JSPrismarine/JSPrismarine/issues/3641) was one
  such default in `setScriptCommands`.
- `prepareLevel` checks `isWorldLoaded` before an `await` and registers the level after it, so two
  loads of one name can both pass. `unloadWorld` closes a level with its players in it. No event
  says a level came or went, and the scripts module reads `getLevels()` once at startup, so a level
  that `debug loadWorld` loads later runs no scripts.
- It also holds the provider registry, the generator factories, the Java worldgen registries and
  presets, and dimension-name resolution.
- Custom dimensions get their Bedrock numbers in stem order from 1000, so removing or reordering a
  dimension in the config files another dimension's chunks under its number.
- `PlayerSession.changeWorld` moves a player to another level's world as if it were a dimension,
  without the level's game rules, clock, weather or custom dimensions.

## Slices

1. [x] **The decision.** ADR 0029 and this plan.
2. [x] **Level identity.** A level's UUID goes into its save on first load, and existing saves get
       one then. `Level` exposes it, and `WorldManager` keys its map by it, with names a lookup on
       the side and one rule for matching them. No behavior changes.
3. [x] **Dimension identity.** A table in each save of dimension UUID to Bedrock number, used for
       every custom dimension: config, datapack and script. An existing save takes the numbers its
       dimensions have now, so no chunk moves. The script-dimension id table in #3630 becomes part
       of it.
4. [x] **Split `WorldManager`.** The provider registry and a worldgen catalog (presets, registries,
       generator factories) move out into modules of their own, leaving a level registry.
5. [x] **Lifecycle and events.** A per-level state machine with one operation at a time, and kernel
       events for attached, detaching and detached. The scripts module, the content runtime and
       the command layer follow the events instead of reading the levels once. Detaching moves
       players to the entry level's spawn and saves before it closes.
6. [x] **The runtime registry.** `levels.json` in the server directory records the levels created at
       runtime, with their UUID, name, folder, creation parameters and state. Startup attaches the
       config's levels and the registry's attached ones. Attaching a level whose name an attached
       level has is refused, and so is a config level whose name an attached registry level has.
7. [x] **Explicit level context.** Command sources, block access, network contexts and the Java
       session carry their level, and the `getDefaultWorld()` calls go. `level-name` names the entry
       level only.
8. [x] **Player transfer.** Moving between levels as one operation: the player's record saved to
       the old level's player data and read from the new one's, the client given the new level's
       game rules, clock, weather and `DimensionData`, and the two script runtimes told. A
       returning player joins the level they left from. The scoreboard's packets go to the level's
       players only, and an arriving player is shown the new level's displays: slice 7 put each
       command on its level's scoreboard, but the packets still go to every player.
9. [x] **Shared player data.** A config setting groups levels whose players share a record, and
       each group lists the parts it shares: inventory, armor, offhand, ender chest, experience,
       health, hunger, effects, game mode, abilities, position, spawn point. A part a group leaves
       out stays per level, and a level in no group shares nothing.
10. [x] **Commands.** `/world list | create | attach | detach | tp`, with permissions nodes, and the
        console the same.
11. [ ] **Script API.** `@jsprismarine/server` lists levels and moves a player between them, and
        creates, attaches and detaches levels where the pack's permissions allow it.
12. [ ] **Multiverse.** The addon in #3630 rebuilt on slices 10 and 11: its own file holds only
        per-world rules (alias, game mode, spawn, access), keyed by level UUID.

## Decided along the way

- The registry is `levels.json`, beside `addons.json` in the server directory.
- A level name is unique among attached levels only. Detached levels may share a name with each
  other and with an attached one, and are told apart by UUID.
- A shared player-data group chooses every part of the record it shares, the position included.
