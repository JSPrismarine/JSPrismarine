---
'@jsprismarine/worldgen': minor
---

Add `@jsprismarine/worldgen`: Java Edition 26.3's terrain stack. It implements
`XoroshiroRandomSource`, `LegacyRandomSource` and both positional factories; Perlin, smeared
Perlin, simplex, normal and old blended noise over the 26.3 noise parameter schema; all 44 density
function operator types, compiled once per tree into closures rather than interpreted per sample;
the eight-slot noise router and the six aquifer functions parsed from `worldgen/noise_settings`;
the noise-based aquifer with its fluid picker; the `minecraft:ore_vein` material rule; and a
chunk-shaped sampler that produces Java block state identifiers for a column or a whole chunk.

Expected values in the test suite come from Mojang's own classes through
`utils/oracle/DumpWorldgenVectors.java` rather than from a second implementation of the same
formulas. All 55 vanilla density functions, 64 noises and 7 noise settings parse with no errors,
and every noise router slot, every aquifer function and nine whole overworld columns match Java
exactly.
