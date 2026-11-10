---
"@jsprismarine/prismarine": patch
---

Open each world's change log tick before the input step and seal it when the world's tick closes, so the inputs, chunk admissions and entity updates of one tick land in one sealed tick. An input-lane packet's handler runs as a unit of its sender's world, and when it throws, what it wrote is undone before the error is reported. A chunk that enters or leaves is named in the log. A world whose store fails to undo a unit stops ticking and logs it once. Legacy entities' position and health and a player's game mode are logged through a transitional adapter, `entity/legacyAdapter.ts`, until players and items move into the store. `World.onChangeTickCost` reports each sealed tick's entries and bytes.
