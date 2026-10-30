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

Plus one inverse, for the one domain that needs one. A chunk stores a numeric Bedrock biome id
rather than an identifier, and block behaviors and spawn rules both ask what biome a position is
in, so `bedrockBiomeToJava` reads that number back:

```ts
bedrockBiomeToJava(37);
// { kind: 'mapped', bedrock: { id: 37, identifier: 'minecraft:mesa' }, java: 'minecraft:badlands' }
```

It takes the numeric id or the Bedrock identifier, and returns `mapped`, a reviewed `loss`, or
`unknown`. There is no `passthrough`: a custom biome has no vanilla id to be stored as, so an
identifier the pinned data does not have is `unknown` whichever namespace it is in. The
correspondence is not one to one in either direction. Five Java biomes share a Bedrock one, and
the inverse names the Java biome that is not on the loss list, so `minecraft:the_end` comes back
as `minecraft:the_end` rather than as `minecraft:end_barrens`. Going the other way, 27 of
Bedrock's 89 biomes have no Java source at all; see `BEDROCK_BIOME_LOSSES` below.

One more lookup is a Bedrock overlay rather than a translation. Java describes a dimension in its
`dimension_type` JSON, and the Bedrock client has three built-in dimensions with fixed integer ids,
its own spelling of one name, and a Nether ceiling of 128 where Java's type says 256.
`bedrockDimensionOverlay(javaDimensionTypeId)` reads the three-row table
`packages/mapping/src/tables/dimensions.json`, the one hand-maintained table in the package, and
returns the id, the Bedrock name, the `Generator` value `StartGame` carries, and `minY` and
`height` only where the client disagrees with the Java type; a type with no row is a custom
dimension and returns `undefined`. `javaDimensionTypeOf(bedrockName)` reads the name back, so
`minecraft:nether` answers `minecraft:the_nether`.

```ts
bedrockDimensionOverlay('minecraft:the_nether');
// { dimensionId: 1, bedrockName: 'minecraft:nether', minY: 0, height: 128, generatorType: 3 }
```

## Block states

A block's states need translating too, and the correspondence is per block rather than per state
name. `bedrockBlockStates(name, states)` and `javaBlockStates(name, states)` do a whole record each
way:

```ts
bedrockBlockStates('minecraft:piston', { facing_direction: 'north', extended_bit: true });
// { facing_direction: 3 }
bedrockBlockStates('minecraft:dropper', { facing_direction: 'north' });
// { facing_direction: 2 }
```

A dropper's `facing_direction` calls north 2 and a piston's calls it 3, because Bedrock's piston
points the other way; a redstone torch spells north `south`, and a door spells it `east`. The write
direction also drops the states a Bedrock block does not carry, which is where Java's piston
`extended` goes. The 27 `(block, state)` pairs that have no word vocabulary at all, because Bedrock
folds two Java properties into one state or packs several booleans into one number, are
`BLOCK_STATE_LOSSES` and travel as the Bedrock value untouched.

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
`ENTITY_LOSSES`, `REGISTRY_LOSSES`, `BEDROCK_BIOME_LOSSES` for the inverse direction, and
`BLOCK_STATE_LOSSES` for the state vocabularies, plus the
merge lists (`BLOCK_MERGES`, `ITEM_MERGES`, `ENTITY_MERGES`) and the dropped-property lists
(`DROPPED_BLOCK_PROPERTIES`, `PARTIAL_BLOCK_PROPERTY_COLLAPSES`). A loss entry names the Java
identifier, the Bedrock fallback, a reason, and a reference:

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

`BEDROCK_BIOME_LOSSES` reads the other way: it names a Bedrock biome rather than a Java one, and
carries no fallback, because there is nothing to fall back to. All 27 entries are legacy terrain
Bedrock keeps so a world generated before its 1.18 terrain change still reads back: the `_hills`,
`_mutated`, `_plateau`, `_shore` and `_edge` variants Java deleted in the same rewrite, plus
`legacy_frozen_ocean` and `deep_warm_ocean`. A chunk only carries one of them if it was generated
by an old Bedrock version, and the inverse reports the loss rather than guessing which modern Java
biome stands in for a biome Java no longer has.

## The five property tests

`packages/mapping/src/mappingProperties.test.ts` adopts Chunker's five property tests, which run
against the full generated tables on every test run:

1. Every Java palette entry maps: all 1286 blocks and 35723 states (plus every item, entity type,
   biome, and enchantment) return `mapped` or a reviewed `loss`, never `unknown`. The biome
   inverse runs the same way, over all 89 Bedrock biomes, by id and by identifier.
2. Every output carries exactly the declared Bedrock state set for its target block.
3. The mapping composed with the reverse index is identity, except for the reviewed loss list.
   Biomes round-trip through the generated inverse both ways rather than through an index the
   test builds.
4. Every output identifier exists in the real Bedrock 1.26.51 data: the block palette, the item
   table, the actor identifier list, and the pinned name sets. The inverse names only Java 26.3
   biomes, and numbers every Bedrock biome exactly once.
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

The state vocabularies and the per-state block property table regenerate separately, from committed
inputs only:

```sh
pnpm --filter @jsprismarine/mapping run generate:block-states
pnpm --filter @jsprismarine/mapping run generate:block-properties
```

## License

The generated tables derive from [GeyserMC/mappings](https://github.com/GeyserMC/mappings), which
GeyserMC publishes under the MIT license. The full license text and the pinned commit are in
[`packages/mapping/NOTICE`](../../packages/mapping/NOTICE), which ships with the published package.
As GeyserMC's own scope note says, neither GeyserMC nor this repository relicenses Minecraft or any
other material owned by Mojang or Microsoft.
