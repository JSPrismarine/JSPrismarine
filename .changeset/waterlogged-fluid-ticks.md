---
'@jsprismarine/prismarine': patch
---

Let the water a waterlogged block holds tick and spread, as Java's does. A fluid tick names the fluid rather than the block it soaks, a scheduled water tick at a waterlogged block runs that water's hooks, a neighbor update reaches the water as Java's `updateShape` does, and a generation mark or saved tick at a waterlogged position is scheduled from its liquid layer. Before, all four were dropped, so a waterlogged block's water never moved.
