---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

A Java player can hit mobs and players and use the item in hand at nothing or on a mob, as a Bedrock player can. Both editions decode their packets into the same intents: Bedrock's `InventoryTransaction` bodies and Java's `Use Item`, `Attack`, `Interact` and `Player Action` release become `useItem`, `attackEntity`, `interactEntity` and `releaseItem`, run by handlers under `input/handlers/`, and a Bedrock block use is the `useItemOnBlock` intent Java's already was. The protocol package defines `Use Item`, `Attack` and `Interact`, and an `lpVec3` field type for Java's packed low-precision vector.
