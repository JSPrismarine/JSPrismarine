---
title: Java to Bedrock mapping
group: Documents
category: Guides
---

# Java to Bedrock mapping

`@jsprismarine/mapping` translates Java Edition identifiers into Bedrock Edition identifiers. This
page is for developers who consume Java-sourced data (loot tables, recipes, tags, predicates) and
need to know how a Java reference becomes something this Bedrock server can use.

## Why this package exists

JSPrismarine's runtime is Bedrock-shaped end to end: blocks, items, entities, and the world all
carry Bedrock identifiers, Bedrock state names, and the Bedrock block palette. But much of the
gameplay data comes from Java Edition, because Java is where Mojang publishes loot, recipes,
advancements, tags, and enchantments as data. Every one of those files references Java identifiers,
so somewhere a Java block state like `oak_log[axis=x]` has to become the Bedrock palette entry
`oak_log` with `pillar_axis: x`.

That translation lives in exactly one module, this one, and nothing else in the server is allowed
to know that two editions exist. The data behind it is the pinned GeyserMC mappings join, generated
into tables at build time rather than hand-maintained, plus a reviewed allow list of every place
the translation loses information. The loader can then refuse to start when a Java identifier has
neither a mapping nor a loss entry, which is what makes the translation total: a lookup never
returns `undefined`. See [the plan, section 5](../plans/data-driven-vanilla.md#5-the-java-to-bedrock-seam)
for the full reasoning.

## The API

Four lookup functions, one per domain:

```ts
import {
    javaBlockStateToBedrock,
    javaEntityTypeToBedrock,
    javaIdentifierToBedrock,
    javaItemToBedrock
} from '@jsprismarine/mapping';

javaBlockStateToBedrock('minecraft:oak_log', { axis: 'x' });
// { kind: 'mapped', bedrock: { name: 'minecraft:oak_log', states: { pillar_axis: 'x' } } }

javaItemToBedrock('minecraft:debug_stick');
// { kind: 'loss', loss: { reason: ..., reference: ... }, bedrock: { identifier: 'minecraft:stick' } }

javaEntityTypeToBedrock('minecraft:zombified_piglin');
// { kind: 'mapped', bedrock: 'minecraft:zombie_pigman' }

javaIdentifierToBedrock('enchantment', 'minecraft:infinity');
// { kind: 'mapped', bedrock: 'minecraft:bow_infinity' }
```

`javaBlockStateToBedrock` takes the Java block id and an optional record of state properties;
omitted properties take the block's Java defaults. `javaIdentifierToBedrock` covers the remaining
mapped registries, currently `biome` and `enchantment` (`MAPPED_REGISTRIES`). The pinned versions
behind the tables are exported as `MAPPING_VERSIONS`.

## Handling the result variants

Every lookup returns a discriminated union on `kind`, with four variants. Handle each:

```ts
const result = javaItemToBedrock(javaId);
switch (result.kind) {
    case 'mapped':
        // The normal case: use result.bedrock directly.
        return result.bedrock;
    case 'loss':
        // A reviewed loss: result.bedrock is the fallback, result.loss says why.
        // Use the fallback, and surface result.loss.reason where a pack author will see it.
        return result.bedrock;
    case 'passthrough':
        // A non-minecraft: identifier, such as a custom namespace. The mapping
        // does not touch it; resolve it against your own custom content registry.
        return result.bedrock;
    case 'unknown':
        // Not an identifier the pinned Java version has. This is a content error:
        // report it, do not guess a fallback.
        throw new Error(`${result.javaId} is not a Java 26.3 identifier`);
}
```

The distinction between `loss` and `unknown` matters. A `loss` is a Java identifier the package
knows and has reviewed: Bedrock genuinely cannot represent it, a fallback was chosen on purpose,
and the entry documents why. An `unknown` is a typo or a version mismatch; the identifier does not
exist in the pinned Java version at all.

## Reading the loss list

The reviewed losses are exported alongside the functions: `BLOCK_LOSSES`, `ITEM_LOSSES`,
`ENTITY_LOSSES`, and `REGISTRY_LOSSES`, plus the merge lists (`BLOCK_MERGES`, `ITEM_MERGES`,
`ENTITY_MERGES`) and the dropped-property lists (`DROPPED_BLOCK_PROPERTIES`,
`PARTIAL_BLOCK_PROPERTY_COLLAPSES`). A loss entry names the Java identifier, the Bedrock fallback,
a reason, and a reference:

```ts
{
    javaId: 'minecraft:spectral_arrow',
    bedrockFallback: 'minecraft:arrow',
    reason: 'Bedrock has no spectral arrow; it becomes a plain arrow.',
    reference: 'docs/research/java-to-bedrock-translation.md section 3'
}
```

The `reference` points at the research note that measured the loss, and at a GeyserMC issue where
one documents it directly. Dropped-property entries additionally carry a `recovery` field saying
where the information reappears, if anywhere: `second-layer` (Bedrock's second block storage layer,
as for `waterlogged`), `block-entity` (NBT, as for shulker box facing), `client-computed` (the
client recomputes it, as for leaf decay distance), or `none`.

## The five property tests

`packages/mapping/src/mappingProperties.test.ts` adopts Chunker's five property tests, which run
against the full generated tables on every test run:

1. Every Java palette entry maps: all 1286 blocks and 35723 states (plus every item, entity type,
   biome, and enchantment) return `mapped` or a reviewed `loss`, never `unknown`.
2. Every output carries exactly the declared Bedrock state set for its target block.
3. The mapping composed with the reverse index is identity, except for the reviewed loss list.
4. Every output identifier exists in the real Bedrock 1.26.51 data: the block palette, the item
   table, the actor identifier list, and the pinned name sets.
5. Every output state value is inside that state's real domain in the 1.26.51 palette.

The tests fail in both directions: when an unlisted loss appears, and when a listed loss stops
occurring. That keeps the loss list exact rather than a growing pile of stale exemptions.

## Regenerating the tables after a version bump

The tables under `packages/mapping/src/tables/` are generated and committed. After bumping the
pinned versions in `packages/bedrock-data/sources.json`:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/mapping run generate:tables
```

The generator joins GeyserMC's `blocks.nbt` against the output of Mojang's Java data generator,
which it runs against the hash-verified server jar when the reports are missing from the cache.
That step needs a JDK of at least version 25, found through `JAVA_HOME` or `JSP_JAVA_HOME`. The
generator refuses to emit when any Java identifier has neither a mapping nor a loss entry, or when
any produced Bedrock state is missing from the pinned palette, so a version bump that introduces a
new loss forces you to review and list it.

The per-state block property table (`bedrockBlockPropertiesOf`) regenerates separately, from
committed inputs only:

```sh
pnpm --filter @jsprismarine/mapping run generate:block-properties
```

## License

The generated tables derive from [GeyserMC/mappings](https://github.com/GeyserMC/mappings), which
GeyserMC publishes under the MIT license. The full license text and the pinned commit are in
[`packages/mapping/NOTICE`](../../packages/mapping/NOTICE), which ships with the published package.
As GeyserMC's own scope note says, neither GeyserMC nor this repository relicenses Minecraft or any
other material owned by Mojang or Microsoft.
