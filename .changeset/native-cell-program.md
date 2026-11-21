---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/worldgen': patch
'@jsprismarine/errors': patch
---

The terrain cell walk fills each interpolation cell's density in the native library: `NativeWorldgen.createCellProgram` runs a `CellProgram`'s records over the `interpolated` cells' corners with the same bits, in one call per cell. `CompileEnvironment` gains an optional `cellProgram`, `InterpolatedCell` gains `corners`, and a cell whose context sets a structure or blending hook stays on the TypeScript interpreter. `NativeWorldgenErrors` gains `CellProgramNotCreated` and `CellBufferTooSmall`.
