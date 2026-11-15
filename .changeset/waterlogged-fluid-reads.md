---
'@jsprismarine/block-behaviors': patch
---

Read a waterlogged block's water as the fluid at its position. `WorldActions` gains an optional `getLiquid`, which answers with the liquid in a position's second storage layer, and the fluid rules ask it wherever Java's `BlockState.getFluidState` would: a waterlogged neighbor counts as a water source for spreading and for two-source conversion, is a hole a stream can fall into, and turns lava beside it into obsidian or cobblestone. A world that keeps one layer only behaves exactly as before.
