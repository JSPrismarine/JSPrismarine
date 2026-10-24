# @jsprismarine/structures

The structure template layer: it reads both template formats Mojang ships, translates the Java one
into Bedrock block states, places a template under a rotation and a mirror, runs the structure
processors over it, and grows a village or a set of trail ruins out of template pools.

Everything it produces is Bedrock-shaped, because that is what the server places.

```ts
import {
    assembleJigsaw,
    applyProcessors,
    createLegacyRandom,
    createProcessorList,
    isStructureChunk,
    readJavaStructureTemplate,
    readMcStructure,
    transformTemplate,
    translateJavaTemplate
} from '@jsprismarine/structures';

const { template, losses } = translateJavaTemplate(readJavaStructureTemplate(bytes));
const placed = transformTemplate(template, { rotation: 'clockwise_90', mirror: 'left_right' });
```

## The two formats

A Minecraft structure template is NBT, and the two editions disagree about almost every part of it.

**Java `.nbt`.** Gzip-compressed, big-endian NBT. The root holds `size`, a `palette` of Java block
states, a `blocks` list of `{pos, state, nbt?}` and an `entities` list of `{pos, blockPos, nbt}`.
`readJavaStructureTemplate` reads it, compressed or not.

Two things vary across the corpus. Java 26.3 renamed the palette entry keys from `Name` and
`Properties` to `id` and `properties`; the reader prefers the spelling the file's `DataVersion`
implies and falls back to the other, so a file that disagrees with its own version still reads. The
hundred oldest files carry `version: 1` and no `DataVersion` at all, and are read by probing the
keys. Twenty files carry `palettes`, a list of palette variants for the same blocks, which land in
`paletteVariants`.

**Bedrock `.mcstructure`.** Uncompressed, little-endian NBT with Bedrock block states.
`readMcStructure` reads it. The format differs in four ways that matter: block indices are a flat
array walking x slowest and z fastest rather than a position per block, `-1` means "change nothing
here", there are two block storage layers rather than one, and entity positions are world
coordinates relative to the saved `structure_world_origin` rather than template coordinates. Each
palette entry carries the game version that wrote its state, kept in `paletteVersions` because the
oldest files in the corpus were saved by 1.16.

Both readers produce positions in template space, with the origin corner at `(0, 0, 0)`.

## The translation and what it costs

`translateJavaTemplate` maps a Java palette onto Bedrock states through
[`@jsprismarine/mapping`](../mapping/README.md) and returns a Bedrock-shaped template. It never
drops a block quietly: every palette entry that does not map cleanly comes back as a
`TemplateTranslationLoss` with its kind, the Java state and how many blocks of the template use it.
Blocks of a lost entry are still placed, as `minecraft:unknown` where the mapping has no state at
all.

Java's `waterlogged` flag has no Bedrock state to live in, so it moves to Bedrock's second block
storage layer as water. That is the one translation that changes the shape rather than the names,
and `applyWaterlogging: false` turns it off.

Measured over the whole shipped corpus, by the gated test in `src/corpus.test.ts`:

| Source | Files | Palette entries | Blocks | Mapped | Lost |
| --- | --- | --- | --- | --- | --- |
| Java Edition 26.3 server jar | 1511 | 20791 | 1170664 | 1170664 (100%) | 0 |
| Bedrock Dedicated Server 1.26.51.1 zip | 1311 | 18043 | 1137782 | 1111645 (97.70%) | 26137 over 1589 entries |

The two rows differ because the Bedrock zip's templates were last saved before Java's 1.13
flattening. Their palettes name 47 identifiers the pinned Java version does not have, among them
`minecraft:stonebrick` with a `variant`, `minecraft:planks`, `minecraft:log2`, `minecraft:wool` and
`minecraft:wooden_door`.

This package does not carry a 1.12 flattening table, and that is a decision rather than an
omission. [The plan](../../docs/plans/data-driven-vanilla.md) section 4 sources structures from
Java's data generator, and the Java corpus translates with nothing lost at all, so the table would
buy nothing the server uses. The Bedrock zip's templates are a cross-check, and their 47 names are
reported rather than guessed at. Writing a flattening table is the work to do if those files ever
become the source.

## Placement transforms

`transformTemplate(template, { rotation, mirror })` moves the block positions, the entity positions
and the direction-valued block states together. The mirror applies before the rotation, as Java
does. A quarter turn swaps the template's x and z extents, and positions stay inside the
transformed template rather than spreading around a world pivot.

Rotating positions is arithmetic. Rotating states is not, and it is where this would go wrong by
hand. Bedrock and Java name their direction axes differently: a Java stair's `facing` is a Bedrock
stair's `weirdo_direction` integer, a Java log's `axis` is a Bedrock log's `pillar_axis`, and a Java
door facing north is a Bedrock door whose `minecraft:cardinal_direction` is east. Java's own rules
are also not symmetric. Measured from the pinned server jar, `StairBlock.mirror` swaps the corner
shape for a z-facing stair under `left_right` and never swaps it under `front_back`, so mirroring
across one axis is not mirroring across the other followed by a half turn.

So the rules are not written here, they are measured. `utils/java-dump/DumpBlockTransforms.java`
compiles against the pinned server jar and records what `BlockState.rotate` and `BlockState.mirror`
return for all 35723 Java block states.
`utils/generate/generate-state-transforms.ts` replays that through the mapping and writes
`src/tables/stateTransforms.json`, keyed by Bedrock state. Regenerate after a version bump:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm exec turbo run build --filter=@jsprismarine/mapping
pnpm --filter @jsprismarine/structures run generate:transforms
```

The table covers 508 identifiers that move, out of the 15953 Bedrock states the Java palette
reaches. Two things it reports rather than hides:

- **No rule.** A state no Java block reaches, such as Bedrock's own `minecraft:sulfur_spike`, has no
  entry. It is placed unchanged and listed in `TransformedTemplate.mismatches` with reason
  `no-rule`.
- **Ambiguous.** 34 transforms over `minecraft:brown_mushroom_block` and
  `minecraft:red_mushroom_block` are ambiguous: Java's six face booleans collapse onto Bedrock's
  13-value `huge_mushroom_bits`, and the collapsed states do not rotate alike. The table keeps the
  first answer and the placement reports reason `ambiguous`. `AMBIGUOUS_STATE_TRANSFORMS` lists
  them.

`verifyStateTransforms()` checks the table against itself: every permutation is a bijection, four
quarter turns are the identity, the two quarter turns are inverses, and each mirror is its own
inverse. A test checks it against the mapping's state domains as well, by turning and reflecting
every one of the 15953 palette states and asserting the result is a state the palette declares.

Block entity and entity NBT travels untouched. A jigsaw block entity's `final_state` names a
direction in text, and transforming that is the caller's job.

## Processors

`createProcessorList` reads a Java `worldgen/processor_list` file and `applyProcessors` runs the
chain over a template. All eleven processor types Java 26.3 registers are implemented, along with
its ten rule tests, three position tests and four block entity modifiers. The 40 vanilla processor
lists use four of the eleven: `rule` 39 times, `protected_blocks` 7, `block_rot` 6 and `capped` 4.

The draw order matters as much as the rules, because it decides what a seeded placement produces,
so the branches and the number of draws per branch were read from the pinned jar's own bytecode.
`block_age`, for instance, builds both its replacement arrays before choosing between them, which
costs four draws whichever branch wins.

Everything a processor needs from outside the template is injected through `ProcessorContext`: the
random source, the world block at a position, the surface height for the gravity processor, block
tag membership for `tag_match` and `protected_blocks`, and whether a state fills its cell for the
lava submerged processor. A chain therefore runs in a test with no world.

Two consequences of working in Bedrock states are worth knowing. Block matching compares Bedrock
identities, so Java states that collapse onto one Bedrock state match together. And Java's
`withPropertiesOf`, which `block_age` and `blackstone_replace` use to carry a stair's facing onto
its replacement, copies the state values the two identifiers both declare, read from the same
pinned palette.

## The jigsaw model

A jigsaw block carries a name, a target name, a target pool, a joint type and an orientation. Two
jigsaws connect when they face each other, the parent's target is the child's name, and either the
joint is `rollable` or the two share a top facing. Bedrock spells the orientation as a
`facing_direction` and `rotation` pair where Java spells it as one `orientation` value, and the
package joins the two through the mapping rather than writing the encoding down.

`assembleJigsaw(config, sources)` starts from a pool, draws an element by weight, picks a rotation,
and walks the connections breadth first. For each jigsaw of each placed piece it draws candidates
from the target pool, then from the pool's fallback, tries the four rotations in a shuffled order,
and takes the first candidate whose own jigsaw faces back and whose bounding box shares no block
with a piece already placed. `maxDepth` stops the walk and `maxDistanceFromCenter` bounds it.

Every draw goes through the injected `RandomSource`, so a seed and a set of pools always produce
the same layout. `createLegacyRandom` is Java's own `java.util.Random` generator, reproduced bit for
bit and tested against values printed by a JDK.

The result reports what it could not do: `rejectedForCollision` counts candidate placements a
bounding box refused, and `unresolvedConnections` counts jigsaws that found no pool, no candidate
or no room.

Two parts of Java's placer are left out, because they need a world this package does not have: the
terrain-matching projection's height adjustment with its `use_expansion_hack` y search, and the
voxel-accurate free-space shape, which here is a list of piece bounding boxes.

## Structure sets and placement

`parseStructureSet` reads a `worldgen/structure_set`, and `isStructureChunk` answers whether a
structure of that set may start in a chunk for a world seed. All three placement types Java
registers are implemented, along with the four frequency reduction methods. The 21 vanilla sets use
`random_spread` 20 times and `concentric_rings` once, with `triangular` spread on three and a
frequency below one on three.

The expected positions in the tests come from Java itself: a program built the real
`RandomSpreadStructurePlacement` with each vanilla set's fields and printed the chunks it chooses
for one seed.

`concentricRingChunks` produces the ring positions strongholds use. Java then moves each one to the
nearest chunk whose biome is in `preferred_biomes`, which needs a biome source, so these are the
unsnapped positions and the caller moves them. Exclusion zones are parsed but not applied, for the
same reason: they depend on another set's placement, so `StructurePlacement.exclusionZone` names the
set and the radius and the caller resolves it.

## The corpus test

`src/corpus.test.ts` reads every template Mojang ships, in both formats, and prints the counts in
the table above. It needs the pinned sources on disk, so it is gated:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
JSP_STRUCTURE_CORPUS=1 pnpm --filter @jsprismarine/structures exec vitest run corpus
```

`JSP_BDS_PATH` and `JSP_JAVA_JAR_PATH` point at local copies instead.
