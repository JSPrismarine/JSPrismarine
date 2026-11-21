---
'@jsprismarine/prismarine': patch
---

Skip the per-tick portal check for an entity whose chunks hold no portal block. The world keeps the set of loaded chunks that may hold a nether or end portal block, fed from chunk loads and block writes, and reads no block of a body standing outside them. On a world without portals, each entity used to read every block its body overlaps each tick, about fifteen for a mob.
