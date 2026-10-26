# @jsprismarine/enchantments

The Java Edition enchantment system: the 43 vanilla definitions, the 31 effect component types, the
enchanting table draw and the anvil. It parses Mojang's JSON once into closures and runs them
against a `PredicateContext` from [`@jsprismarine/predicates`](../predicates), which supplies the
conditions, the number providers and the level based values this package composes.

Every rule here was read out of the Java 26.3 server jar, not off a wiki page. The enchanting table
and the anvil are ported from `EnchantmentHelper`, `EnchantmentMenu` and `AnvilMenu`; the tests
check them against values a Java program produced from the real `java.util.Random`.

## Install

```bash
pnpm add @jsprismarine/enchantments
```

## Using it

```typescript
import { EnchantmentRegistry, enchantingOffers, parseEnchantment } from '@jsprismarine/enchantments';

const { value: sharpness, diagnostics } = parseEnchantment('minecraft:sharpness', json);

const registry = new EnchantmentRegistry({
    definitions: [sharpness],
    tags: new Map([['minecraft:in_enchanting_table', ['minecraft:sharpness']]]),
    items: { tagsOf: (item) => itemTags[item] ?? [] }
});

registry.modifyValue('damage', baseDamage, { enchantments: stackLevels, context: { parameters } });
registry.runEffects('post_attack', { enchantments: stackLevels, enchanted: 'victim', context }, apply);
enchantingOffers(registry, stack, { seed: player.enchantmentSeed, bookshelfPower: 15 });
```

Parsing never throws. A malformed field reports into a `DiagnosticCollector` and takes a safe
default, so one broken file does not take the pack down with it.

## The model

`EnchantmentDefinition` carries every field of the 26.3 format. All 43 vanilla files have
`anvil_cost`, `description`, `max_cost`, `max_level`, `min_cost`, `slots`, `supported_items` and
`weight`; 42 have `effects`, 18 have `exclusive_set` and 5 have `primary_items`.

`min_cost` and `max_cost` both take the base plus per level form, which `costAt` evaluates as
`base + perLevelAboveFirst * (level - 1)`. A bare number also parses, as a cost with no per level
part. `slots` names one or more of the 11 equipment slot groups. Java hardcodes the lowest level of
every enchantment to 1, which this package exports as `MIN_ENCHANTMENT_LEVEL`.

`supported_items`, `primary_items` and `exclusive_set` parse through the predicates package's
`resolveMembers`, so each keeps both the ids it names directly and the tags it reaches through.

## Effect coverage

| Registry | 26.3 registers | This package | Vanilla's 43 files use |
| --- | --- | --- | --- |
| `enchantment_effect_component_type` | 31 | 31 | 30 |
| `enchantment_value_effect_type` | 6 | 6 | 4 |
| `enchantment_level_based_value_type` | 6 plus the bare number | 7 | 5 |
| `enchantment_entity_effect_type` | 15 | 15 | 12 |
| `enchantment_location_based_effect_type` | 16 | 16 | 13 |

The last column is measured by the corpus test over the real files, not copied from a note. Nothing
declares `mob_experience`. `exponential` and `all_of` never appear as value effects, though `all_of`
is common as a world effect. `exponent` never appears as a level based value, and a constant is
always written as a bare number rather than as a type. `replace_block`, `run_function` and
`set_block_properties` never appear at all.

One earlier count needs correcting: `docs/research/java-registries-and-components.md` says vanilla
uses five of the six value effect types. It uses four. The note counted `all_of`, which only ever
appears in the entity and location grammar.

Each component declares the loot context key set its `requirements` evaluate against, read from
`EnchantmentEffectComponents` in the jar: nine use `enchanted_damage`, eight `enchanted_entity`,
five `enchanted_item`, one `enchanted_location`, one `hit_block`, and seven carry no conditions at
all.

### Running them

`modifyValue` folds a component's value effects over a starting number. The component picks the
context key set, so a caller passes the parameters of the moment and this package fills in
`enchantment_level` per enchantment. Enchantments apply in the order the enchantment map iterates
and effects within one enchantment in file order, which is what Java does and what makes `add`
after `multiply` differ from the reverse.

`runEffects` resolves a component's entity, location and attribute effects and hands each one to an
`EffectSink`. Every level based value and number provider is already resolved against the level and
the context; identifiers, block states, block predicates and particle options stay as the parsed
JSON they came from, because those registries live in the host. Durations are in seconds, the unit
the Java effects carry before they multiply by 20. Nothing in the world changes here. Summoning a
lightning bolt, replacing a disk of ice and playing a sound all belong to the server, so the sink
gets a description and decides what to do with it.

`markerApplies` answers the three components that carry no body: `damage_immunity` is a condition
with nothing attached, `prevent_armor_change` and `prevent_equipment_drop` are presence alone.
`soundAt` answers the two sound banks, clamping a level past the end of the list to the last entry.

## The enchanting table

`enchantmentCost(random, slot, bookshelfPower)` is Java's formula verbatim. Bookshelves above 15
change nothing. The base is `nextInt(8) + 1 + power / 2 + nextInt(power + 1)`; the top row costs a
third of it with a floor of one, the middle row two thirds plus one, and the bottom row the larger
of the base and twice the power. A row whose cost is below its own index shows nothing.

`selectEnchantments` widens the row cost by the item's enchantability, nudges the result by up to 15
percent either way, picks one candidate by weight, then keeps halving the level and picking again
while `nextInt(50)` stays at or below it, dropping candidates that conflict with the last pick.
`availableEnchantments` offers at most one level per enchantment: it walks a candidate's levels
downward and keeps the first whose cost window contains the draw.

`enchantingOffers` drives all three rows from one generator, seeded with the player's enchantment
seed for the costs and reseeded with `seed + row` for each row's draw, which is why the rows stay
put until the player enchants something. A book drops one pick at random when the draw produced
more than one, which is Java's way of making book offers less generous than they look.

Two enchantments share an item when neither one's exclusive set names the other and they are not
the same enchantment. That is the only compatibility rule; it runs during the draw, in the anvil,
and through `areCompatible` for anything else that needs it.

## The anvil

`combineInAnvil` is `AnvilMenu.createResult`, step for step.

A repair material restores a quarter of the item's durability and costs one level, repeating until
the item is whole or the material runs out. Combining two of the same item adds the sacrifice's
remaining durability plus 12 percent of maximum, for two levels. Merging enchantments raises two
equal levels by one and takes the larger of two unequal ones, capped at the enchantment's
`max_level`, and charges `anvil_cost` per resulting level, halved with a floor of one when the
enchantments come from a book. Each enchantment the item already carries that conflicts with an
incoming one costs a level and blocks that one; a combination where everything is blocked produces
nothing. Renaming costs one level.

The prior work penalty is the `minecraft:repair_cost` component. The anvil adds both inputs' penalty
to the cost and writes back `max(base, addition) * 2 + 1`, which is what makes the fourth or fifth
combination of one item unaffordable. A pure rename is the exception: it does not raise the penalty
and it caps at 39 levels instead of being refused. Everything else at 40 levels or more produces
nothing unless the player has unlimited materials.

Nothing here consumes items or experience. The caller decides whether the player can pay.

## The loot interaction

Two enchantments do nothing through their own files. `fortune.json` has no `effects` key at all, and
`looting.json` only adjusts equipment drop chance. Their drop bonuses live in the block loot tables,
which name `minecraft:fortune` directly in 32 `apply_bonus` calls and 35 `table_bonus` conditions.
Those loot functions already own the bonus arithmetic. All they need is the level on the tool.

`createEnchantmentView(registry)` returns the `EnchantmentView` the predicates package declares, so
`apply_bonus`, `table_bonus`, `enchant_randomly` and `enchant_with_levels` read levels, maximum
levels, the applicable set and the table draw through one object. This package does not repeat the
`ore_drops`, `uniform_bonus_count` or `binomial_with_bonus_count` formulas; the tests check that
feeding the view into a real `apply_bonus` produces the vanilla counts.

Fifteen more tags under `tags/enchantment/` carry behavior that lives neither in the file nor in the
loot tables: `curse`, `double_trade_price`, `in_enchanting_table`, `non_treasure`,
`on_mob_spawn_equipment`, `on_random_loot`, `on_traded_equipment`,
`prevents_bee_spawns_when_mining`, `prevents_decorated_pot_shattering`, `prevents_ice_melting`,
`prevents_infested_spawns`, `smelts_loot`, `tooltip_order`, `tradeable` and `treasure`. The registry
expands them, including tags that name other tags, which `in_enchanting_table` does.

## Bedrock projection limits

`projectToBedrock` maps each enchantment through an injected mapper. Adapt
`javaIdentifierToBedrock('enchantment', id)` from [`@jsprismarine/mapping`](../mapping) to the
`EnchantmentIdentifierMapper` shape; this package stays unaware that two editions exist.

42 of Java's 43 enchantments have a Bedrock id. `sweeping_edge` does not, and neither does any
datapack enchantment, because a Bedrock client only knows the enchantments its own registry lists.
There is no packet that teaches it a new one.

What this costs is worth stating plainly. The mechanics still run: every effect component resolves
on the server and reaches the world through an `EffectSink`, so a server-side enchantment deals its
damage and spawns its particles exactly as a mapped one does. What the client loses is the display
and the preview. `projectToBedrock` returns a lore line for each unmapped enchantment and sets
`forceGlint` when nothing on the stack reached the client, because otherwise an enchanted item
would look plain. The player gets no tooltip ordering, no enchantment-specific tooltip color, and
nothing in the creative or anvil interfaces that recognizes the enchantment. The client's own anvil
and enchanting previews are wrong whenever a server-side enchantment is involved, so the server has
to send the result rather than let the client compute it.

## Injectable seams

All of these are optional, and a member a host leaves out makes the operation that needs it report
or fall back rather than throw.

- `ItemView` on the registry answers item tags, enchantability, durability, damage, the repair
  material and the display name. It merges over `componentItemView`, which reads
  `minecraft:enchantable`, `minecraft:max_damage`, `minecraft:damage` and `minecraft:repairable` off
  the stack, so a host overrides only what it knows better. Without `tagsOf`, a tag-named item set
  matches nothing.
- `EffectSink` on `runEffects` receives every resolved world change. There is no default: a caller
  that wants effects to happen writes one.
- `EnchantmentIdentifierMapper` on `projectToBedrock` is the only place this package can learn a
  Bedrock id.
- `RandomSource` from the predicates package drives every draw. `javaRandom` reproduces
  `java.util.Random` draw for draw, which is what makes an enchanting offer match vanilla for a
  given seed; `scriptedRandom` makes a test exact.
- `ReferenceResolver` on the parse options expands the item and enchantment tags a file names.
  Without it the tag names survive unexpanded and the `ItemView` answers membership instead.

## Corpus test

`corpus.test.ts` parses all 43 real enchantment files and all 22 enchantment tags out of the cached
server jar, asserts no parse errors, and measures the coverage table above. It reports one warning,
which comes from the predicates package rather than this one: `lunge.json` reaches for the `food`
member of the player sub-predicate, which that package does not implement. The test needs the cache
that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so it only runs with
`JSP_VANILLA_DATAPACK` set and CI without the cache skips it.

The ungated tests run against twelve of the 43 files, copied verbatim into `test/fixtures.ts`. The
vanilla data is a cached input this repository regenerates rather than a snapshot it vendors, so
only the subset the behavior tests need lives in the package.

## License

MIT
