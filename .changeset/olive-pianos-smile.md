---
'@jsprismarine/engine-systems': patch
---

Stop a piston and a copper bulb conducting redstone. Java's `Blocks` refuses both through `isRedstoneConductor(Blocks::never)`, but it does so from shared property factories rather than from an inline registration, so the ten blocks they cover were missing from `NON_CONDUCTING_FULL_CUBES` while being opaque enough for `isFullCube` to read them as conductors. `powered_repeater` and `unpowered_repeater` leave the set: Java's `REPEATER` registration calls `isRedstoneConductor` not at all, and the default already refuses them.

The surrounding documentation said "26 blocks override it". 26 is the number of call sites in `Blocks`; they cover 65 blocks and 2.
