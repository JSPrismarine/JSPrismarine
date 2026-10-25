---
'@jsprismarine/prismarine': minor
---

Implement the three `FeatureWorld` hooks the data-driven generator was missing, so the features
that need them produce something. `GenerationRegion` answered only `isColdEnoughToSnow`, which
left a generated chest empty, a dungeon spawner inert, an end gateway leading nowhere, the end
spike without its crystal, and a fossil unburied.

`setBlockEntity` records what a feature attached and writes it as the Bedrock block entity NBT
the LevelDB provider already persists, with a chest carrying its loot table path and a seed mixed
from the world seed and the position. `spawnEntity` records the end crystal as a chunk entity
spawn, which the world creates when the chunk is first loaded. `placeTemplate` goes through
`@jsprismarine/structures`: the template is read, rotated, mirrored and run through the
`worldgen/processor_list` the feature named, and lands as the Bedrock states that package
resolves. The templates are read from the pinned Java server jar on first use, or from a
directory named by `JSP_JAVA_STRUCTURES`.

Breaking: `GenerationRegion.forEachCenterBlock` now hands its visitor a `RegionBlock`, which
carries the Java state as `java` and, for a block out of a template, the resolved Bedrock state as
`bedrock`. `JavaWorldgenRegistries` gained `processorLists`.
