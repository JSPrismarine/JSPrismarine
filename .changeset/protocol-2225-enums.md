---
'@jsprismarine/minecraft': patch
---

Generate the protocol 2225 enums. The datagen manifest declares Minecraft 1.26.60 alongside
1.26.51, pinned to the v1.26.60 `metadata.zip` release asset, and the 31 public enums for that
release are exported from `generated/v2225/`. That asset carries `x-enum-binary-value` itself, so
it is its own values release rather than needing a later one.

Five enums differ from the 2193 copies. `ItemStackRequestActionType` gains
`CRAFT_RESERVED_ACTION = 18` and renumbers `CRAFTING_NON_IMPLEMENTED_DEPRECATED` and
`CRAFTING_RESULTS_DEPRECATED` to 19 and 20; `ContainerUiId` gains `RESERVED_CONTAINER_A` through
`D` at 67-70; `WindowTypes` gains `RESERVED_CONTAINER_TYPE = 38`; `DisconnectReason` gains
`SUB_CLIENT_LOGIN_NOT_BOUND = 150`; and `LevelSoundEvent` gains `ICE_BALL_BREAK`, moving
`UNDEFINED` to 615.

Nothing existing moved. 2193 stays the default version, the unversioned exports are unchanged, and
no code reads the 2225 enums yet.

The 2225 entry carries enums only: its block palette and recipes are captured from a Bedrock
Dedicated Server of that version, and no such capture exists yet. The block and recipe generators
now skip a non-default version in that state, naming the commands that populate it, rather than
failing the whole run.
