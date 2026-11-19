---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
'@jsprismarine/engine-systems': patch
'@jsprismarine/entities': patch
'@jsprismarine/block-behaviors': patch
'@jsprismarine/errors': patch
'@jsprismarine/protocol': patch
---

Behavior pack scripts hear most of the remaining `world.afterEvents` and `world.beforeEvents` of `@minecraft/server`: a player's block placement, game mode change, change of dimension, emote, button input, input mode, hotbar slot, inventory changes, cursor, crafting, mining, arm swing, item use stages, dropped and picked-up stacks, containers opened and closed, name tags and script messages; an entity's load and removal, melee hits, projectile hits, status effects, heals, health changes, taming and data-driven events; explosions and the blocks they clear, game rule changes, and pistons, levers, buttons and pressure plates. The before-events run as guards of their actions and can cancel them or change what they allow, such as an effect's duration, a blow's damage, a heal's amount, a game mode or the blocks a blast clears. Each subscriber's options pick the events it gets. Block custom components get `onStepOn`, `onEntityFallOn`, `onEntity`, `onRedstoneUpdate` and `onBlockStateChange`.

The server raises a kernel event for each of these, which plugins can listen to as well: `playerPlaceBlock` and `playerBlockPlaced`, `playerGamemodeChanged`, `playerDimensionChanged`, `entityRemove` and `entityRemoved`, `entityEffectAdd` and `entityEffectAdded`, `entityHeal`, `entityHealed` and `entityHealthChanged`, `explosion` and `exploded`, and the rest that `docs/guide/extending.md` lists. `playerSetGamemode`'s mode is writable.

For code that embeds these packages: `ScriptWorld` has an optional `guardGameEvents`, `ScriptWorldEvent` has a `game` variant, engine-systems' `ExplosionOptions` takes a `guard`, entities' `EntityEnvironment` takes `eventApplied`, block-behaviors' `WorldActions` takes `redstoneActivated`, and protocol exports `ScriptMessagePacket`.
