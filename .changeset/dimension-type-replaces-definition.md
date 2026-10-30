---
'@jsprismarine/prismarine': minor
---

Replace `DimensionDefinition` with `DimensionType`, which joins a parsed Java `dimension_type`
with the Bedrock overlay from `@jsprismarine/mapping`. `id` is now the Java id
(`minecraft:the_nether`); the integer the client and the LevelDB keys use is `bedrockId`, the
client's spelling is `bedrockName` (aliased as `name`), `minY` and `height` are the bounds the
client accepts, `java` is the parsed definition, and `custom` marks a type the client has no
built-in dimension for. `dimensionTypeOf` builds one, `Dimensions` is built from the vanilla 26.3
documents with the bounds it had before, and `dimensionByName` accepts both spellings.
`DimensionDefinition` stays as a deprecated alias for one release. The dimension module is now
exported from the package.
