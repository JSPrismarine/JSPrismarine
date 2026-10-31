---
'@jsprismarine/item-behaviors': minor
'@jsprismarine/prismarine': patch
---

Throw an eye of ender toward the nearest stronghold. `WorldActions` gains an optional `locate` query and the `locate` action becomes a `signal` action carrying the stack and the point to fly to, which removes `LocateAction` from the public union. The server answers the query through its structure search, spawns a written `EyeOfEnderSignal` that flies as Java's does and drops or shatters after eighty ticks, and offers a right click on nothing to the item in hand's `onUse`.
