# @jsprismarine/mapping

The Java Edition to Bedrock Edition seam. This package owns the knowledge that two editions exist:
it maps Java 26.3 identifiers onto Bedrock 1.26.51 identifiers through generated, vendored tables
and a reviewed loss list. Nothing outside this package should name both editions.

## Interface

Four total functions, one per domain. Each returns a typed result: `mapped`, a reviewed `loss`
with a reason and a reference, `passthrough` for non-`minecraft:` identifiers, or `unknown` for
identifiers the pinned Java version does not have. A lookup never returns `undefined`.

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

The reviewed loss list is exported alongside the functions (`BLOCK_LOSSES`, `ITEM_LOSSES`,
`ENTITY_LOSSES`, `REGISTRY_LOSSES`, the merge lists and the dropped-property lists). Every known
loss carries a reason and a reference, and the property tests fail both when an unlisted loss
appears and when a listed one stops occurring.

## The tables

The tables under `src/tables/` are generated and committed. They come from the pinned sources in
`packages/bedrock-data/sources.json`: GeyserMC/mappings `blocks.nbt` (positional over Java block
state ids) joined against Mojang's `reports/blocks.json`, GeyserMC `items.json` and `biomes.json`,
and this repository's own BDS 1.26.51.1 captures as the Bedrock source of truth. The GeyserMC data
is MIT; see [NOTICE](NOTICE).

To regenerate after a version bump:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/mapping run generate:tables
```

The generator runs Mojang's Java data generator against the hash-verified server jar when its
reports are missing from the cache, which needs a JDK of at least version 25 (`JAVA_HOME` or
`JSP_JAVA_HOME`). It refuses to emit when any Java identifier has neither a mapping nor a loss
entry, or when any produced Bedrock state is missing from the pinned palette.

## The block property table

`bedrockBlockPropertiesOf(name, states?)` answers the Java-sourced per-state block properties -
hardness, blast resistance, friction, light emission and dampening, correct-tool requirement,
random tick, push reaction, and fire odds - keyed by Bedrock block state, the server's identity.
The table is flattened from the Java 26.3 jar dump golden in `@jsprismarine/bedrock-data` through
the block mapping; regenerate it with:

```sh
pnpm --filter @jsprismarine/mapping run generate:block-properties
```

It needs only committed inputs, no fetched sources. Bedrock-only blocks with no Java source
(the chemistry set, `allow`, `deny`, the deprecated palette entries) are listed in
`BEDROCK_ONLY_BLOCKS` and return `undefined`, so callers keep their own values rather than a
silent default. Where collapsed Java states disagreed on a value, the kept rows are listed in
`BLOCK_PROPERTY_CONFLICTS` for review.

## The property tests

`src/mappingProperties.test.ts` adopts Chunker's five property tests, run one way: every Java
palette entry maps; every output carries exactly the declared Bedrock state set; the mapping
composed with the reverse index is identity except for the reviewed loss list; every output
identifier exists in the real Bedrock palette for the pinned version; and every output state value
is in that state's real domain.
