---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/worldgen': patch
'@jsprismarine/errors': patch
---

The trees under `final_density`'s `interpolated` nodes run in `@jsprismarine/native-worldgen`'s C library when it loads, with the same bits as their closures. `NativeWorldgen.createProgram` registers a density program and `eval` runs it one position at a time. `DensityFunctionCompiler.nativeSampler` and `RandomState.nativeSampler` give a tree's native evaluator. `NativeNoiseStack.nativeHandle` and `NativeStackNoise.native` expose a stack to a program, and `blendedNoiseMultipliers` gives `old_blended_noise`'s coordinate factors. An overworld chunk's terrain fill makes 1,079 noise calls from TypeScript, all of them the aquifer's, where it made 15,683.
