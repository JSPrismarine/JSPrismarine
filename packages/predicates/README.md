# @jsprismarine/predicates

The Java Edition predicate, item modifier and value provider evaluator. Loot tables, advancements
and enchantments all compile their conditions and functions through this package. It parses
Mojang's JSON once into closures and evaluates them against a `PredicateContext` that carries the
loot context parameters, an injected random source, and the views a host plugs its own registries
into.

Every grammar member here was read out of the Java 26.3 server jar rather than from a wiki page.
Parsing never throws: faults land in a `DiagnosticCollector` as errors or warnings, and the
evaluation gives the safe answer instead.

## Install

```bash
pnpm add @jsprismarine/predicates
```

## Using it

```typescript
import { PredicateContext, parsePredicate } from '@jsprismarine/predicates';

const { value: survivesExplosion, diagnostics } = parsePredicate({ type: 'minecraft:survives_explosion' });

const context = new PredicateContext({
    parameterSet: 'block',
    parameters: { block_state: { name: 'minecraft:stone' }, origin: { x: 0, y: 64, z: 0 }, explosion_radius: 4 }
});

survivesExplosion(context);
context.diagnostics.entries;
```

`parseItemModifier`, `parseIntProvider`, `parseFloatProvider` and `parseLevelBasedValue` follow the
same shape: they return the compiled value together with the diagnostics from parsing it.

## Grammar coverage

| Registry | 26.3 registers | This package |
| --- | --- | --- |
| `loot_condition_type` | 20 | 20 |
| `loot_function_type` | 42 | 42 |
| `context_int_provider_type` | 23 | 23 |
| `context_float_provider_type` | 28 | 28 |
| `enchantment_level_based_value_type` | 6 plus the bare-number constant | 7 |
| `loot_score_provider_type` | 2 | 2 |
| `loot_nbt_provider_type` | 2 | 1, `storage` reported |
| `entity_sub_predicate_type` | 25 | 23, with `nbt` and `slots` reported |
| `data_component_predicate_type` | 15 | 4 typed, the rest reported, plus the presence fallback |

Three names in the original brief for this package do not exist in 26.3, and the table above
follows the jar. `block_state_property` is now `match_block` and carries the block predicate
inline. `value_check` split into `int_value_check` and `float_value_check`. `reference` was removed
when every field learned to take a bare id, which is the composition rule below. The jar also adds
`environment_attribute_check`, which the brief did not list.

The entity sub-predicates implemented are the 14 vanilla's own loot tables and advancements use
(`entity_type`, `location`, `components`, `type_specific/sheep`, `equipment`, `flags`, `vehicle`,
`distance`, `type_specific/player`, `type_specific/cube_mob`, `type_specific/fishing_hook`,
`type_specific/raider`, `type_specific/lightning`, `stepping_on`) plus `entity_tags`, `movement`,
`movement_affected_by`, `effects`, `periodic_tick`, `team`, `passenger`, `targeted_entity` and
`predicates`. `nbt` and `slots` need an NBT matcher and a slot model that live elsewhere, so they
warn and evaluate false.

## The composition rule

26.3 made every field of a composable type accept four forms: an inline value, a namespaced id, a
list mixing both, and a hash-prefixed tag id. One helper, `parseComposed`, implements it for all
eight composable registries, and every predicate, modifier and provider field in this package goes
through it.

```json
{ "condition": "minecraft:tool/can_silk_touch" }
{ "condition": [{ "type": "minecraft:survives_explosion" }, "minecraft:tool/can_shear"] }
{ "modifier": [{ "type": "minecraft:set_count", "count": 2 }, "minecraft:some_modifier"] }
```

A list of predicates reads as an `and`, and a list of modifiers applies in order, which is what
Java does. `resolveMembers` covers the sibling member form, used by fields such as an item
predicate's `items`, which name registry members instead of elements. A reference that points at
itself reports a cycle rather than recursing.

## Injectable seams

All of these are optional. A member a host leaves out makes the predicate that needs it report a
diagnostic and evaluate false, rather than failing the whole parse.

- `ReferenceResolver` on the parse options resolves namespaced ids to element JSON and tags to
  member ids. Without it, inline grammar still works and a reference is an error.
- `RandomSource` on the context is the only randomness the evaluator uses, so `random_chance`,
  `uniform`, `binomial`, `explosion_decay` and the weighted list reproduce exactly in a test.
  `scriptedRandom`, `constantRandom` and `seededRandom` are built in.
- `LevelView` answers weather, the world clock, biomes, structures, light, blocks, fluids, command
  storage, scoreboards and environment attributes.
- `ItemStackOps` owns stack construction, component writes, the stack size limit and the durability
  limit, so a host keeps its own item type behind the minimal `{ id, count, components }` shape this
  package reads.
- `EnchantmentView` answers enchantment levels, maximum levels and the enchanting table draw.
- `ContentView` answers the few content questions the modifiers need and this package cannot own:
  smelting results, player profiles, exploration map search, loot entry rolls and the dye table.
- `GrammarExtensions` on the parse options registers entity sub-predicate and data component
  predicate types this package does not implement, keyed by namespaced id, merged over the built-in
  tables.

## Loot context parameters

`CONTEXT_PARAMETER_SETS` holds the 31 context key sets of 26.3 with the required and optional
parameters of each, read from `LootContextParamSets` in the server jar. Reading a parameter the
declared set does not provide reports

```
the chest loot context does not provide block_state
```

and yields undefined, so a predicate attached to the wrong loot table fails loudly instead of
quietly passing. A required parameter the host forgot to supply reports as well; an absent optional
parameter does not.

## Decisions worth knowing

**The item stack shape is fixed and its operations are injectable.** Threading a generic stack type
through 20 conditions and 42 modifiers adds type noise without changing behavior, so a host adapts
its own stack to `{ id, count, components }` at the edge and controls allocation, component
defaults and limits through `ItemStackOps`.

**Float providers round to 32 bits.** Java's float registry is `float`, not `double`, and the
difference is visible: `set_damage` with a damage of 0.9 floors to 10 in Java and would floor to 9
in double arithmetic. `Math.fround` on every float draw reproduces Java's value.

**An unregistered key in a `predicates` map is a presence check.** 26.3 falls back to `AnyValue`
when the key names a data component type rather than a predicate type, which is how vanilla writes
`{"minecraft:map_id": {}}`. This package follows that and warns only when the ignored body is
non-empty.

**A tag that no resolver can expand is not an error in a member field.** The subject often carries
its own tag list, so `resolveMembers` keeps the tag name and matches against it.

## Corpus test

`corpus.test.ts` parses the real Java 26.3 vanilla datapack out of the cached server jar and
asserts the grammar reports nothing at all, neither errors nor warnings. It measures 3 predicate
files, 26 int provider files, 4 float provider files, 1302 condition fields and 1098 modifier
fields across 1447 loot tables, and 263 loot conditions across 1866 advancements. It needs the
cache that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so it only runs
with `JSP_VANILLA_DATAPACK` set and CI without the cache skips it.

## License

MIT
