---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

The surface pass runs in the native library: `NativeWorldgen.createSurface` runs a material rule program over a chunk's columns with the same blocks as `MaterialRuleInterpreter`, including the jittered biome lookup and the ore veins, and hands back the blocks that reach a condition only the TypeScript answers. `BuildSurfaceOptions` gains `biomeZoomSeed` and `native`, `SurfacePass` gains `handedBack`, `LegacyPositionalRandomFactory` gains `seedLanes`, oreVein exports `isBarrenVeinCell`, and `NativeWorldgenErrors` gains `SurfaceNotCreated`.
