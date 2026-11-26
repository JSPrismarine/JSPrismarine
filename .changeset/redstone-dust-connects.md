---
'@jsprismarine/engine-systems': patch
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Fix redstone dust so it connects, fades and turns off the way it does in Java Edition. A wire now reads power from everything but other wires, so a run carries one level less per block and goes dark when its source goes; it used to hold every wire at full strength for good. Dust follows dust one block up or down a step, and it powers only what it points into: a lone dust powers all four sides, and a run powers the blocks off both of its ends. The server also writes the four `redstone_<side>` states, so the client draws each dust connected to its neighbors.

`@jsprismarine/engine-systems` adds `blockSignalToWire`, `wireShapeOf` and `wireConnectingSide`, an optional `wiresSignal` argument on the signal readers, and the `HorizontalDirection`, `WireShape` and `WireSide` types. `@jsprismarine/block-behaviors` adds the optional `redstonePowerToWire` and `redstoneWireShape` world actions.
