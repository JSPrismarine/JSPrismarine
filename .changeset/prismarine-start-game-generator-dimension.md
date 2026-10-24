---
'@jsprismarine/prismarine': patch
---

`StartGamePacket` now carries the world's generator type and dimension instead of a fixed Overworld generator in dimension 0. A flat world is announced as `Flat`, which is what a Bedrock Dedicated Server sends for one.
