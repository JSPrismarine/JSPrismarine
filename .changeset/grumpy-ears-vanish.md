---
"@jsprismarine/client": minor
"@jsprismarine/minecraft": minor
---

The client package now exports `Behavior`, `BehaviorContext`, `BreakBehavior`, `ChatBehavior`, `LookBehavior`, `WalkBehavior`, `BEHAVIORS`, `BEHAVIOR_NAMES`, and `createBehaviors`. `BotOptions` and `FleetOptions` now use `behaviors`, and the CLI accepts `--behavior`. Update imports, options, and CLI invocations to these names.

The Minecraft package renames `BlockSchemaCatalog` and its source module. Update direct subpath imports to the new module and type name.
