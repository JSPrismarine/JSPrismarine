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

One inverse, for the one domain that has one. A chunk stores a numeric Bedrock biome id, so
`bedrockBiomeToJava()` resolves that number, or the Bedrock biome identifier, back to the Bedrock
biome and the Java biome behind it. It is total over the 89 biomes the pinned Bedrock data lists:
62 carry a Java source, and the 27 legacy biomes Java 26.3 deleted in its 1.18 terrain rewrite are
`BEDROCK_BIOME_LOSSES`, each with a reason.

```ts
import { bedrockBiomeToJava } from '@jsprismarine/mapping';

bedrockBiomeToJava(37);
// { kind: 'mapped', bedrock: { id: 37, identifier: 'minecraft:mesa' }, java: 'minecraft:badlands' }

bedrockBiomeToJava('minecraft:taiga_hills');
// { kind: 'loss', bedrock: { id: 19, identifier: 'minecraft:taiga_hills' }, loss: { reason: ... } }
```

`javaBlockFluidKindOf()` reads the fluid carried by a Java block state. It returns `water` for
water-bearing blocks such as kelp and seagrass, `water` for a state with `waterlogged=true`,
`lava` for lava, and `empty` otherwise.

```ts
javaBlockFluidKindOf({ name: 'minecraft:kelp', properties: {} }); // 'water'
```

`javaDyeColorIndexOf()` gives the Java palette ordinal used by entity `minecraft:color` components.
`bedrockDyeIndexOf()` resolves the reversed Bedrock data value used by banners from the same color
name list.

`createPackIdentifierResolver()` wraps these lookups in the `IdentifierResolver` shape that
`reportIdentifiers` in `@jsprismarine/packs` injects, so a datapack's referenced identifiers can be
checked against the tables without that package knowing two editions exist. This is what lets the
server refuse to start on an identifier nothing accounts for, and it covers every registry a Java
datapack can reference:

- Items, blocks, entity types, biomes (`worldgen/biome`), enchantments, mob effects and potions go
  through their lookup. `mapped` and `passthrough` report as `known`, reviewed losses as `loss`.
- The registries with no Bedrock side go to the generated Java 26.3 census in
  `src/tables/javaIdentifiers.json`, which says only that the identifier is a real entry of that
  registry. That reports as `known` for the nine registries the server evaluates in Java's own
  shape, which `src/packRegistries.ts` lists with a reason each, and as `loss` for the three in
  `UNTRANSLATED_REGISTRIES`: banner patterns, goat horn instruments and painting variants reach a
  Bedrock client as a short code, a data value and a texture name, and no pinned source publishes
  the pairing. There is no passthrough here, so a custom structure or game event is `unknown`.
- A tag reference is `unknown`. Resolving one means knowing which tags the stack loaded, which only
  `reportIdentifiers` can see, so it answers those itself.

Run against the real 26.3 datapack this resolves all 4088 referenced identifiers: 3977 known, 111
on the allow list, none left over. `src/vanillaIdentifiers.test.ts` is that measurement.

The reviewed loss list is exported alongside the functions (`BLOCK_LOSSES`, `ITEM_LOSSES`,
`ENTITY_LOSSES`, `REGISTRY_LOSSES`, `BEDROCK_BIOME_LOSSES`, `BLOCK_STATE_LOSSES`,
`UNTRANSLATED_REGISTRIES`, the merge lists and the dropped-property lists). Every known loss
carries a reason and a reference, and the property tests fail both when an unlisted loss appears
and when a listed one stops occurring. `UNTRANSLATED_REGISTRIES` is the one registry-wide row
shape; it pins how many entries the registry has, so a version that adds one fails the property
test rather than widening the row in silence.

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

## The block state vocabularies

`bedrockBlockStates(name, states)` and `javaBlockStates(name, states)` translate a whole state
record between Java's words and the Bedrock palette's own spelling. Java writes a direction as
`facing=north`; Bedrock writes a number, under a state name of its own, and the number is per
block - a dropper's `facing_direction` calls north 2 and a piston's calls it 3. A redstone torch
spells north `south`, and a door spells it `east`. None of it follows from the state's name.

```ts
bedrockBlockStates('minecraft:piston', { facing_direction: 'north', extended_bit: true });
// { facing_direction: 3 } - Bedrock has no extended state; an extended piston has an arm in front
javaBlockStates('minecraft:dropper', { facing_direction: 2 }); // { facing_direction: 'north' }
```

The table is read out of the block mapping, per block, by finding the one Java property whose
values pick each Bedrock state's values; regenerate it with:

```sh
pnpm --filter @jsprismarine/mapping run generate:block-states
```

It needs only committed inputs. The 27 `(block, state)` pairs that have no word vocabulary at all,
because Bedrock folds two Java properties into one state or packs several booleans into one
number, are listed in `BLOCK_STATE_LOSSES` and travel as the Bedrock value untouched.

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
