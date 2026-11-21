---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/worldgen': patch
'@jsprismarine/errors': patch
---

The terrain cell walk decides each filled cell's fluids in the native library: `NativeWorldgen.createAquifer` runs the noise aquifer's cell search, pressure and fluid picking over its density programs with the same answers as `NoiseBasedAquifer`. `RandomState` gains `nativeProgram` and `native`, `XoroshiroPositionalRandomFactory` gains `seedLanes`, `NativeDensityProgram` gains `nativeHandle`, `NoiseBasedAquifer.skipSamplingAboveY` is public, and `NativeWorldgenErrors` gains `AquiferNotCreated`. A cell whose context sets a structure or blending hook keeps the TypeScript aquifer.
