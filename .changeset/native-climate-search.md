---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/worldgen': patch
'@jsprismarine/errors': patch
---

The biome climate search runs in `@jsprismarine/native-worldgen`'s C library when it loads, with the same answers as the TypeScript search, exact ties and Java's prior-result seed included. `NativeWorldgen.createClimate` registers a flattened climate tree, and `ClimateParameterList` and `SharedClimateParameterList` take `{ native: false }` to keep the TypeScript search.
