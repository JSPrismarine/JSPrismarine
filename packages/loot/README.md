# @jsprismarine/loot

The Java Edition loot table evaluator. It parses the 1447 vanilla tables of Java 26.3 once into
closures and rolls them against a context, reproducing Java's draw order, weight formula and random
sequence seeding.

The conditions and item modifiers a table carries are not implemented here. `@jsprismarine/predicates`
owns those, and this package composes them, so everything below is about the table grammar itself:
pools, entries, rolls and the order the three modifier levels apply in.

## Install

```bash
pnpm add @jsprismarine/loot
```

## Rolling one table

```typescript
import { createLootContext, lootSequenceRandom, parseLootTable, rollLootTable } from '@jsprismarine/loot';

const { value: table, diagnostics } = parseLootTable(json);

const context = createLootContext({
    parameterSet: table.parameterSet,
    parameters: { origin: { x: 0, y: 64, z: 0 }, block_state: { name: 'minecraft:coal_ore' }, tool },
    random: lootSequenceRandom(worldSeed, table.randomSequence)
});

rollLootTable(table, context);
```

Parsing never throws. Every fault lands in the returned diagnostics and the table rolls to whatever
is still well formed, which is the same contract `@jsprismarine/predicates` has.

Most servers will use the registry instead, because it already knows the world seed, the pack stack
and each table's own context key set:

```typescript
import { LootRegistry } from '@jsprismarine/loot';
import { load } from '@jsprismarine/packs';

const { definitions } = load(stack);
const loot = new LootRegistry(definitions, { worldSeed: 1234n });

loot.validate(); // compiles every table and reports reference cycles
loot.roll('minecraft:blocks/coal_ore', { parameters: { origin, block_state, tool } });
```

## Grammar coverage

| Registry | 26.3 registers | This package | Vanilla uses |
| --- | --- | --- | --- |
| `loot_pool_entry_type` | 9 | 9 | 6 |
| `loot_condition_type` | 20 | through `@jsprismarine/predicates` | 13 |
| `loot_function_type` | 42 | through `@jsprismarine/predicates` | 19 |

The nine entry types are `item`, `tag`, `loot_table`, `dynamic`, `slots`, `empty`, `group`,
`alternatives` and `sequence`. The original brief for this package listed eight and left the ninth
open; the ninth is `slots`, which 26.3 added with the `slot_source` registry. Vanilla ships no slot
source files and uses no `slots` entry, so this package parses the entry and hands its `slot_source`
JSON to an injected view rather than implementing a slot model it has nothing to check against.

`dynamic` is the other entry whose body lives outside this package. Java calls these dynamic drops
and uses them for contents a block entity carries into its own drop, such as a shulker box's
inventory. There is one in vanilla, `minecraft:blocks/decorated_pot` for its sherds.

Counts come from the corpus test described below, and agree with
[the registry research note](../../docs/research/java-registries-and-components.md) section 3.

## What 26.3 renamed

If you are reading older loot documentation, four field names have moved, and this package follows
the 26.3 jar rather than the wiki:

- `functions` is now `modifier`, on the table, the pool and the entry alike.
- `conditions` is now `condition`.
- A `loot_table` entry names its target in `value`, not `name`, and the value may be an inline
  table, an id, a list, or a `#tag`.
- A `tag` entry names its items in `items`, not `name`.

A table with no `type` falls back to the `generic` context key set, which is what
`LootContextParamSets.ALL_PARAMS` is registered as.

## Evaluation order

One roll walks the table in Java's order, and the order is observable, so it is worth stating
exactly.

1. The table's pools run in file order.
2. A pool whose `condition` fails is skipped whole.
3. A pool rolls `rolls` plus `floor(bonus_rolls * luck)` times. The multiplication happens in 32-bit
   float arithmetic and is floored afterwards, so `bonus_rolls` of 0.6 adds nothing at luck 1 and
   two rolls at luck 4.
4. Each roll expands every entry container in the pool into candidates. A container whose own
   `condition` fails contributes none. `alternatives` stops at the first child that contributes,
   `sequence` stops at the first child that does not, and `group` runs all of them.
5. A candidate's weight is `floor(weight + quality * luck)`, clamped at zero, again in float
   arithmetic. Candidates of weight zero are dropped before the draw.
6. One candidate is drawn in proportion to weight. With a single candidate, Java skips the draw and
   takes it, which matters because it consumes no randomness.
7. Each stack the candidate produces passes through the entry's `modifier`, then the pool's, then
   the table's. A modifier that discards a stack ends it there.
8. Results above the item's maximum stack size are split into whole stacks and a remainder, which
   is what Java's public roll does. Pass `split: false` for the raw list.

## The seeding rule

A table names a `random_sequence`, and Java keeps one stream per sequence id for the world. The
stream is a Xoroshiro128++ generator seeded from the world seed upgraded to 128 bits, exclusive-ored
with the MD5 hash of the sequence id, then mixed with Stafford variant 13 on both halves. That is
reproduced bit for bit here, and `random.test.ts` checks the draws against Java oracle vectors.

Two consequences a server has to get right. Two worlds with the same seed break the same ore into
the same drops, and two tables in one world never share a stream. Rolling one table twice must not
replay the same draws, so `LootRegistry` creates each stream once and lets it advance, the way
Java's `RandomSequences` does. Tables that name no sequence share one unkeyed stream, standing in
for Java's level random.

```typescript
import { lootSequenceRandom } from '@jsprismarine/loot';

lootSequenceRandom(1234n, 'minecraft:blocks/coal_ore'); // the stream that table draws from
lootSequenceRandom(1234n); // the fallback for a table with no sequence
```

## Injectable seams

Every seam is optional. A table that reaches one the host left out reports a diagnostic and produces
nothing there, rather than failing the roll.

- **The random source.** Rolling uses only `context.random`, so a scripted or seeded source
  reproduces a draw exactly. That is what makes the distribution tests here exact counts rather than
  samples.
- **`ItemStackOps`,** from `@jsprismarine/predicates`, owns stack construction, the stack size limit
  and component writes. The splitter in step 8 asks it for `maxStackSize`.
- **`DynamicDropSource`** answers a `dynamic` entry, keyed by the name the entry carries.
- **`SlotSourceView`** answers a `slots` entry from its raw `slot_source` JSON.
- **`LootContentOptions`** fills the content view described in the next section.
- **`LootPackDefinitions`** is the pack stack the registry reads. `Definitions` from
  `@jsprismarine/packs` satisfies it structurally, so you pass that object straight in and this
  package keeps no dependency on the loader.
- **`ItemIdentifierMapper`** translates a result to Bedrock, covered below.

## The content view

`@jsprismarine/predicates` declares a `ContentView` with five members it deliberately left for this
package, because all five turn out to be loot questions. `createLootContext` builds the view and
wires it into a predicate context, which is the only way to close the loop `set_contents` needs:
rolling its nested entries takes the very context whose content view is being built.

| Member | Who answers it | Default |
| --- | --- | --- |
| `smeltingResult` | `furnace_smelt` | Indexed from the `minecraft:smelting` recipes you pass in. Without recipes the modifier reports and leaves the stack alone. |
| `rollEntries` | `set_contents` | This package's own entry grammar, rolled against the same context. Always available. |
| `dyeColors` | `set_random_dyes` | `DYE_COLORS`, the 16 `DyeColor.textureDiffuseColor` values of Java 26.3 in registry order. |
| `profileOf` | `fill_player_head` | The entity's own `minecraft:profile` component. Override with `profiles`. |
| `explorationMap` | `exploration_map` | Needs a `structures` locator. Given one, it writes `minecraft:map_id` from your allocator and a `minecraft:map_decorations` entry keyed `"+"` at rotation 180, matching Java's `addTargetDecoration`. |

```typescript
const context = createLootContext({
    parameterSet: 'chest',
    parameters,
    content: {
        recipes: definitions.recipesJava,
        itemTag: (tag) => myTags.get(tag),
        structures: (request) => myWorld.findStructure(request.destination, request.searchRadius),
        mapIds: () => myMaps.allocate()
    }
});
```

Smelting results follow Java: the recipe's own result and count, not a copy of the input, and the
first recipe to claim an ingredient wins. Tagged ingredients need `itemTag`; vanilla's 73 smelting
recipes all name plain items, so the seam only matters for a datapack that adds one.

## References and cycles

26.3 removed the `reference` condition and function and made every composable field accept an
inline value, a namespaced id, a list mixing both, or a `#tag`. A `loot_table` entry's `value` goes
through the same rule, so one entry can name several tables at once, and `expand: true` turns each
into its own weighted candidate instead of rolling them all.

A reference that leads back to the table it started from reports a cycle instead of recursing. The
registry finds cycles two ways. During a parse, the composition helper catches a reference already
on the stack and reports it at the field that closed the loop. Separately, `LootRegistry.cycles`
walks the raw JSON without compiling anything and gives each cycle as the chain that closes it,
which `validate()` turns into a diagnostic:

```
loot table reference cycle: minecraft:a -> minecraft:b -> minecraft:a
```

The vanilla stack has 57 `loot_table` entries pointing at other tables, and no cycles.

## Translating to Bedrock

A rolled result carries Java item identifiers. `mapLootToBedrock` translates it through an injected
lookup, and `javaItemToBedrock` from `@jsprismarine/mapping` satisfies that lookup as it is. The
mapping package stays a development dependency here, so this package never learns that two editions
exist.

```typescript
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { mapLootToBedrock } from '@jsprismarine/loot';

const { stacks, losses } = mapLootToBedrock(loot.roll(id, request), javaItemToBedrock);
```

Nothing is dropped silently. A reviewed loss keeps the fallback item listed in
`@jsprismarine/mapping` and reports one entry with the reason and its reference; an identifier the
pinned Java version does not have is dropped and reports a loss of kind `unknown`. Losses come back
one per affected stack, in the order the roll produced them, so a report can name the table that
produced each.

Data component payloads ride along untouched. Translating a component to its Bedrock form belongs to
the item layer, not to the loot evaluator.

## Corpus test

`corpus.test.ts` loads the real Java 26.3 vanilla datapack through `@jsprismarine/packs`, which also
checks the pack-stack adapter against the real loader rather than a hand-built double. It measures:

- 1447 tables over 1589 pools, parsing with no diagnostic at all, neither errors nor warnings, and
  no reference cycles.
- Six of the nine entry types in use: `item` 2556, `alternatives` 87, `loot_table` 57, `empty` 39,
  `dynamic` 1, `tag` 1.
- Every table rolled 20 times from world seed 1234, throwing nowhere, with 1335 of the 1447 producing
  at least one stack.

The 112 that produce nothing produce nothing in the game either for that subject. They are the
doors, beds and tall plants whose `match_block` wants a `half` or `part` the fixed block state does
not carry, the genuinely empty tables (fire, spawner, budding amethyst, armor stand, most passive
mobs), and the shearing tables that want a sheep color.

The test needs the cache that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates,
so it only runs with `JSP_VANILLA_DATAPACK` set and CI without the cache skips it.

## Decisions worth knowing

**The random sequence generator is implemented here rather than imported.** It is the same
Xoroshiro128++ that `@jsprismarine/worldgen` uses for terrain, but loot has no business depending on
the terrain stack for sixty lines of arithmetic. If a third package needs it, the generator should
move to a shared package and both should import it from there.

**Cycle detection is a parse-time report, not a runtime guard.** Java detects the loop at roll time
with a visited set and logs "Detected infinite loop in loot tables". Reporting at parse time gives
the same outcome, nothing produced at the point of recursion, and tells a pack author about it
before a player opens the chest.

**The table's declared context key set is checked against the roll's.** `rollLootTable` reports when
they disagree, because a table attached to the wrong context is the failure mode that otherwise
looks like a table that quietly drops nothing. `LootRegistry.roll` takes the set from the table, so
it never trips on its own.

## License

MIT
