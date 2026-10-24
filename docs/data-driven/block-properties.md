---
title: Block properties
group: Documents
category: Guides
---

# The Java-sourced block property table

Block gameplay values, including hardness, blast resistance and light emission, no longer come
from hand-written values in block classes. They come from a generated table in
`@jsprismarine/mapping`, sourced from Java Edition 26.3 and keyed by Bedrock block state. This
page explains where the values come from, what reads them, and which numbers changed because the
old hand-written ones were wrong.

## Where the values come from

Neither edition publishes block properties as data. No Mojang report lists hardness, blast
resistance, friction or light, so the values have to come from the game's code. Mojang removed
obfuscation from Java Edition in release 26.1, which makes the official server jar readable, and a
small dumper in this repository reads the properties out of it:

1. **The dump.** `pnpm --filter @jsprismarine/bedrock-data run dump:java` downloads the pinned
   Java 26.3 server jar, verifies its sha1, compiles
   `packages/bedrock-data/utils/java-dump/DumpJavaData.java` against it, and runs the dumper. The
   result is a committed golden, `packages/bedrock-data/src/jsp/java/block_properties.json`, with
   one row per Java block state. This is a capture-time task, run on a Java version bump rather
   than on every build, and it needs a JDK matching the jar (Java 25 for 26.3).
2. **The flattening.** `pnpm --filter @jsprismarine/mapping run generate:block-properties` runs
   `packages/mapping/utils/generate/generate-block-properties.ts`, which pushes every Java state's
   property row through the Java-to-Bedrock block mapping and files it under the Bedrock state it
   resolves to. The output is `packages/mapping/src/tables/blockProperties.json`, generated and
   committed, keyed by Bedrock state because the Bedrock state is the server's identity. The
   flattening needs only committed inputs, no network.

The engine reads the table through `bedrockBlockPropertiesOf(name, states?)` from
`@jsprismarine/mapping`. Without `states` it answers the block's base row; with them it folds in
any per-state override, so a lit candle reports its light and a fully grown crop stops random
ticking.

## What reads it

Four engine behaviors in `@jsprismarine/prismarine` now answer from the table, each falling back
to the block class's own value for a name outside it:

- **Hardness and break time.** `Block.getHardness()` reads the table, and `getBreakTime` scales it
  by 1.5 when the tool in hand can harvest the block and 5 when it cannot. Hardness `-1` is Java's
  marker for the unbreakable blocks, and `getBreakTime` now reports an infinite time for them, so
  bedrock, barriers and portals never give way.
- **Blast resistance.** `Block.getBlastResistance()` reads the table, and explosions
  (`packages/prismarine/src/entity/Explosion.ts`) decide what breaks with a `survivesBlast` rule
  instead of the old `BLAST_PROOF` name set. The rule is the center-ray bound of vanilla's curve:
  vanilla fires rays that start at `power * (0.7..1.3)` and lose `(resistance / 5 + 0.3) * 0.3`
  per block crossed, so a block survives when its own absorption stops the strongest possible ray.
  Obsidian at 1200 shrugs off any vanilla blast and water's 100 is why a one-block moat tames TNT.
  Liquids absorb a blast outright whatever their listed resistance.
- **Light.** `Block.getLightLevel()` reads the emitted light and `getLightFilter()` the dampening,
  both 0 to 15.
- **Flammability.** `Block.getFlammability()` reads Java's burn odds, fire's chance of consuming
  the block once lit.

The table knows every palette block with a Java source, which is roughly 1200 more blocks than the
class registry declares, so these behaviors now answer correctly for blocks the server has no
class for.

## What changed

Routing the reads through the table corrected hand-written values. The headline cases, each pinned
by a test in `packages/prismarine/src/block/Block.test.ts` or
`packages/mapping/src/blockProperties.test.ts`:

| Block            | Property         | Old value  | Java 26.3 value |
| ---------------- | ---------------- | ---------- | --------------- |
| Obsidian         | blast resistance | 6000       | 1200            |
| Crying obsidian  | blast resistance | 6000       | 1200            |
| Bedrock          | blast resistance | 18,000,000 | 3,600,000       |
| Command blocks   | blast resistance | 18,000,000 | 3,600,000       |
| Sandstone        | hardness         | 4          | 0.8             |
| Torch            | light emission   | 15         | 14              |
| Cobweb           | hardness         | 0          | 4               |
| Bedrock, portals | break time       | finite     | never breaks    |

Operators will notice the obsidian change most: at 1200 it still survives any vanilla blast, but
the number plugins read is now Java's.

## The Bedrock-only exception list

182 palette blocks have no Java source: the Education Edition chemistry set (the bulk of the
list), the world-editing blocks (`minecraft:allow`, `minecraft:deny`, `minecraft:border_block`)
and the deprecated palette entries. They are listed in the exported `BEDROCK_ONLY_BLOCKS` set, and
`bedrockBlockPropertiesOf` returns `undefined` for them rather than a silent default. Fallback
means each `Block` getter keeps the value the block class carries, so a Bedrock-only block behaves
exactly as it did before the table existed.

## Collapse conflicts

Several Java states can collapse onto one Bedrock state, because Bedrock does not represent every
Java property. When the collapsed rows disagree on a value, the generator keeps the first source's
value and records the disagreement in the exported `BLOCK_PROPERTY_CONFLICTS` list for review.

The current table carries 39 reviewed conflicts across 23 blocks, all on Java properties Bedrock
does not represent, and all on two fields. The `randomTick` conflicts (20 blocks) come from leaf
distance and plant stage: Java's `distance=7` leaves and `stage=1` bamboo stop ticking, and
Bedrock has no such state to key the difference on. The `lightDampening` conflicts (3 blocks) come
from piston extension: an extended Java piston has no base in its block, which changes what light
passes. A conflict on any other field or block is a flattening regression to review, and a test in
`packages/mapping/src/blockProperties.test.ts` pins both counts.

## Regenerating after a version bump

Update the Java pin in `packages/bedrock-data/utils/java-dump/run.mjs` (version and server jar
sha1), then:

```sh
pnpm --filter @jsprismarine/bedrock-data run dump:java
pnpm --filter @jsprismarine/mapping run generate:block-properties
```

The first command refreshes the golden from the new jar; the second reflattens the table. Both
outputs are committed, so the diff shows exactly which values Mojang changed. If the Bedrock pin
or the block mapping moved too, regenerate the mapping tables first
(`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` followed by
`pnpm --filter @jsprismarine/mapping run generate:tables`).

## In the table but not yet consumed

The table carries five more fields per state that no engine behavior reads yet: `friction`,
`randomTick`, `pushReaction`, `requiresCorrectTool` and `igniteOdds`. Consuming them is planned
work. The break-time formula is slated to account for tool quality and the correct-tool rule in
[phase 1 of the plan](../plans/data-driven-vanilla.md), and random ticking, pistons and fire
spread are engine systems of phase 5 (plan section 9). Until then, those fields are carried so a
version bump keeps them current, and `BedrockBlockProperties` already types them for callers.
