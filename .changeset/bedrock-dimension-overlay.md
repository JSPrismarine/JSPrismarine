---
'@jsprismarine/mapping': patch
---

Add the Bedrock dimension overlay: `bedrockDimensionOverlay(javaDimensionTypeId)` and
`javaDimensionTypeOf(bedrockName)`.

Java describes a dimension in `dimension_type` JSON; the Bedrock client has three built-in
dimensions with fixed integer ids, its own spelling of the Nether's name, and a Nether ceiling of
128 where Java's type says 256. The new three-row table `src/tables/dimensions.json` carries, per
Java type id, the Bedrock id, the Bedrock name, the `Generator` value `StartGame` sends, and a
`minY` and `height` only where the client disagrees with the Java type. A type with no row is a
custom dimension and returns `undefined`.

`@jsprismarine/minecraft` moves from a development dependency to a dependency, because the
overlay's `generatorType` is typed as its `Generator` enum.
