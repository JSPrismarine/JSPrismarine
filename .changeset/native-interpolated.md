---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/worldgen': patch
---

Point programs run `interpolated` nodes: the native library samples one per block from the cell's corners as `sampleAt` does, so trees that reach one, such as the ore veins' density, richness and gap, run in C. `PointProgramHooks` gains `interpolated`, and a sample whose context has interpolation buffers on keeps its closure.
