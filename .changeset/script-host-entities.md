---
'@jsprismarine/script-host': patch
---

Scripts reach most of `@minecraft/server`'s entity and player surface. Every entity component a definition can give an entity reads its JSON with the defaults BDS reports, `Entity.getComponents` lists them, and riding, leashing, taming, fire, projectiles, NPCs, breathing and inventories write through the world. `Entity` gains its motion and states, its box, the blocks it stands on and looks at, the entities it looks at, properties, definition events, `matches`, `tryTeleport`, `lookAt`, `setRotation` and `addItem`; `EntityTypes` lists the world's types. `Player` gains experience, the spawn point, permission levels, the camera, the HUD's elements, input permissions and input, the client's system info, aim assist, item cooldowns, the control scheme, chat name decorations, sounds and music. `world.getAimAssist()` reads the vanilla aim assist registry and registers a script's categories and presets.

A world gives these members their behavior through the new optional `ScriptWorld.entitySystems`, typed by `@jsprismarine/script-host/host/entities/world`.
