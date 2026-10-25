---
title: Gameplay data
group: Documents
category: Guides
---

# Gameplay data from Java Edition

Most of what this server decides about loot, crafting, advancements and enchanting is read out of
Java Edition's published data rather than written in TypeScript. That makes the rules replaceable.
A datapack dropped into the pack stack changes them the same way it would change a Java server.
This page says which data the server actually runs, how to override it, and which overrides will
not take effect.

It assumes you are comfortable with Java datapack layout. For the reasoning behind running two
pack formats at once, read [architecture.md](architecture.md) first;
[using-packs.md](using-packs.md) covers the loader itself.

## Why the gameplay rules come from Java

Mojang publishes Java Edition's gameplay rules as data a server reads at load time. Bedrock keeps
much of the same material in the engine. The behavior packs that Bedrock Dedicated Server
1.26.51.1 ships carry 159 entity loot tables and 145 chest tables, but only 99 block tables, and
96 of those are the colored concrete and wool slabs and stairs. Every other block's drops are
compiled in, and nothing in those packs is an advancement or an enchantment definition. Java
publishes all of it as data.

So the server takes gameplay from Java and presents it through Bedrock identifiers, states and
packets. One module, `@jsprismarine/mapping`, owns the translation between the two editions, and
[architecture.md](architecture.md) explains why that split is the tractable one.

Here is what Java 26.3's vanilla datapack contributes, counted from the extracted files:

| Registry      | Directory under `data/<namespace>/` | Vanilla 26.3 files | Evaluated by                 |
| ------------- | ----------------------------------- | -----------------: | ---------------------------- |
| loot table    | `loot_table/`                       |               1447 | `@jsprismarine/loot`         |
| recipe        | `recipe/`                           |               2042 | `@jsprismarine/recipes`      |
| advancement   | `advancement/`                      |               1866 | `@jsprismarine/advancements` |
| tag           | `tags/<registry>/`                  |                883 | `@jsprismarine/content`      |
| damage type   | `damage_type/`                      |                 51 | read as tags by mob loot     |
| enchantment   | `enchantment/`                      |                 43 | `@jsprismarine/enchantments` |
| predicate     | `predicate/`                        |                  3 | `@jsprismarine/predicates`   |
| item modifier | `item_modifier/`                    |                  0 | `@jsprismarine/predicates`   |
| function      | `function/*.mcfunction`             |                  0 | `@jsprismarine/mcfunction`   |

The datapack Mojang's data generator writes carries no item modifier files and no functions, but
both registries route, so a datapack of yours can fill them.

## Turning the pack stack on

The content build is off by default while the subsystems migrate, and nothing on this page happens
until you turn it on. Four keys in `config.yaml` control it, and the server writes them with their
comments the first time it starts:

```yaml
content-packs: true
content-strict: false
content-world-packs: []
content-datapacks: []
```

The two vanilla halves are fetched rather than shipped, so fetch them before the first run:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/bedrock-data run datagen:java
```

Without them the stack loads short and reports each missing member as a `pack.missing` warning.
`JSP_CONTENT=1` turns the build on for a single run without editing the file, and
`JSP_VANILLA_DATAPACK` points at a datapack directory of your own instead of the cached one.

The stack is assembled in a fixed order: the vanilla Bedrock behavior pack, this project's
`jsprismarine_vanilla` overlay, the Java vanilla datapack, then your `content-world-packs`, then
your `content-datapacks`. Later members override earlier ones, which is why your datapacks come
last.

## Loot

`@jsprismarine/loot` parses the 1447 vanilla tables once into closures and rolls them against a
context. It owns the table grammar only: pools, entries, rolls and the order the three levels of
modifier apply in. Every condition and item modifier inside a table is compiled by
`@jsprismarine/predicates`, so the two packages share one grammar with advancements and
enchantments.

### The grammar

Java 26.3 registers nine `loot_pool_entry_type` members and this package implements all nine:
`item`, `tag`, `loot_table`, `dynamic`, `slots`, `empty`, `group`, `alternatives` and `sequence`.
Vanilla uses six of them, and the distribution is lopsided: 2556 `item` entries, 87 `alternatives`,
57 `loot_table`, 39 `empty`, one `dynamic` (the decorated pot's sherds) and one `tag`, across 1589
pools.

Evaluation follows Java's order exactly, because the order is observable. Pools run in file order
and a pool whose `condition` fails is skipped whole. A pool rolls `rolls` plus
`floor(bonus_rolls * luck)` times in 32-bit float arithmetic. A candidate's weight is
`floor(weight + quality * luck)`, and a candidate of weight zero is dropped before the draw. Each
drawn stack then passes through the entry's `modifier`, the pool's, and the table's, in that order.

Seeding follows Java too. Each table names a `random_sequence`, and the server keeps one
Xoroshiro128++ stream per sequence id, seeded from the world seed mixed with the MD5 hash of the
sequence id. Two worlds with the same seed break the same ore into the same drops, and no two
tables share a stream.

### Where loot is rolled today

Here is where a table actually gets rolled. Every path goes through the same registry, so what
`/loot` reports and what a block drops cannot disagree.

**Block drops.** `rollBlockDrops` in `packages/prismarine/src/block/blockLoot.ts` is reached from
an ordinary break, an explosion, and `Block.getDrops`. The tool in hand goes into the context as
the `tool` parameter, which is what makes Silk Touch, Fortune and the shears branches work. They
are `match_tool` conditions and `apply_bonus` and `table_bonus` functions inside the table, reading
the `minecraft:enchantments` component off the stack. An explosion also supplies
`explosion_radius`, which every vanilla block table reads through `minecraft:explosion_decay`. That
rule keeps each item with probability `1 / radius`, so stone blown up by a radius-4 TNT blast yields
cobblestone one time in four.

The index from a Bedrock block to its Java table resolves backwards, from the block being broken.
The server reads the block's own state, turns it back into a Java block state through
`bedrockBlockStateToJava`, and asks the stack for that block's table; when the exact Java block has
none, it falls back to the other Java blocks the Bedrock identifier stands for, which is how a
Bedrock wall torch still drops a torch. The Java properties go into the roll as `block_state`, so
vanilla's `match_block` conditions work — that is what makes a double slab drop two and a shelf
mushroom at `growth=1` drop two rather than one.

Resolving from the state matters because the two editions split blocks differently. Bedrock gives
`minecraft:black_concrete_double_slab` and `minecraft:lit_furnace` identifiers of their own where
Java states them as `type=double` and `lit=true`, and an index built forward from Java's default
state never reaches them. 113 identifiers used to drop nothing for this reason, all 59 double slabs
among them.

243 of the 1477 palette identifiers still resolve no table. 182 are Bedrock-only blocks Java has no
counterpart for, and 37 correctly drop nothing in both editions — air, bedrock, barriers, the
command blocks, the light blocks. The remaining 24 are a known gap: 13 wall signs, 10 coral wall
fans and `wall_banner` reuse another block's table through `dropsLike` in Java's code rather than in
any data file, so nothing the loot path can read says what they drop.

**Mob drops.** `rollMobDrops` in `packages/prismarine/src/entity/mobLoot.ts` builds the same kind of
index over the `minecraft:entities/...` tables. The killer goes in as `attacking_entity` and, when
it is a player, as `last_damage_player`, with its main hand attached, so Looting raises counts
through `enchanted_count_increase` and the player-only rare drops unlock. The damage source is
resolved into a Java damage type and that type's `damage_type` tags are looked up from the stack's
own tag files, which is what lets a turtle struck by lightning and a ghast killed by its own
fireball take their special branches.

**`/loot`.** The command's four sources resolve against the same indexes, so
`/loot spawn ~ ~ ~ mine ~ ~-1 ~` yields exactly what breaking that block by hand would. The command
is registered only when the content build exists.

**Generated chests are a reference, not a roll.** When a structure places a chest, the generator
writes the Bedrock spelling of the table into the block entity's `LootTable` tag and a per-position
`LootTableSeed` beside it, and stops there. Nothing in the server opens that tag and rolls it yet,
so a structure chest stays empty. The reference and the seed are correct and stable, so the roll
can be added without regenerating any world.

### Translating a result to Bedrock

A rolled result carries Java item identifiers. `mapLootToBedrock` translates a list through
`javaItemToBedrock` and reports every reviewed loss rather than dropping it. Note that the drop
paths above do not call it today: they hand the Java identifier straight to `Item`. For all but a
handful of items the two editions spell the name identically, so this is invisible, but the two
reviewed item losses (`furnace_minecart` and `spectral_arrow`) and any Java-only identifier will
arrive under a name the Bedrock item registry does not have.

## Recipes

`@jsprismarine/recipes` reads Java's 2042 recipe files and implements all 22 serializers that
`RecipeSerializers` registers in the 26.3 jar. Vanilla uses every one of them. Eight of the 22 are
the `crafting_special_*` serializers whose logic is Java code rather than fields in the file, and
four more (`crafting_transmute`, `crafting_dye`, `crafting_imbue`, `crafting_decorated_pot`) are
code behind a parameterized file, so twelve of the 22 are real implementations here: firework
assembly, banner duplication, book cloning, shield decoration, map extending, item repair, dye
averaging and the rest.

The grid is cropped to the bounding box of its filled slots before any recipe sees it, which is what
lets a 2x2 recipe match in any corner of a 3x3 table, and a shaped pattern is tried at every offset
and in both the written and the mirrored arrangement.

`CraftingDataPacket` is written from the registry. `compileRecipeBook` translates the whole book
through `javaItemToBedrock`, `buildCraftingData` in `@jsprismarine/wire` turns it into the packet's
lists, and `PlayerSession.sendCraftingData` sends it on join. Recipe network ids come from registry
order: `orderRecipes` sorts by namespace and then path, comparing UTF-16 code units, and
`assignNetIds` numbers the sorted list from 1 because Bedrock reserves 0 for "no recipe". Adding one
recipe renumbers everything that sorts after it, so a reload has to resend the whole list rather
than patch it.

Not everything goes out, and most of what stays behind does not need to. Twelve of the 22
serializers are left out because the Bedrock client already has them, compiled in as multi recipes
keyed by a UUID: the eight `crafting_special_*` types plus `crafting_transmute`, `crafting_dye`,
`crafting_imbue` and `crafting_decorated_pot`. Two more shapes are built and then dropped because
protocol 2193's packet has no list for them, smithing trim and the four cooking serializers, and
the server cooks on its own instead. The startup report counts all of it, along with any ingredient
the wire forced down to a single item.

The `crafting-recipe-limit` config key caps how many recipes go out; `0` sends nothing and `-1`
sends everything.

## Advancements

`@jsprismarine/advancements` parses the 1866 vanilla files into a tree with their rewards and
requirements, and implements all 58 registered trigger types. Vanilla uses 54 of them across 4045
criteria. `requirements` is read as conjunctive normal form, so every group must hold at least one
completed criterion, and a file with no `requirements` completes when every criterion does.

### How many triggers actually fire

Seventeen. The rest are parsed, indexed and ready, and nothing in this server ever raises them,
because the subsystem that would know the event does not exist.

`packages/prismarine/src/advancement/triggers.ts` holds one function per thing that happens in the
world, and a function is there only when something calls it. The seventeen it raises are
`inventory_changed`, `thrown_item_picked_up_by_player`, `recipe_crafted`, `player_killed_entity`,
`entity_killed_player`, `player_hurt_entity`, `entity_hurt_player`, `placed_block`,
`enchanted_item`, `location`, `tick`, `changed_dimension`, `consume_item`,
`item_durability_changed`, `default_block_use`, `any_block_use` and `item_used_on_block`.

Those seventeen cover 2176 of vanilla's 4045 criteria, and because a recipe advancement completes
on either of its two criteria, 1797 of the 1866 files have at least one path to completion that a
wired trigger can take. The remaining 69 have a requirement group with no wired criterion in it,
so nothing can finish them. `adventure/sleep_in_bed`, `adventure/hero_of_the_village`,
`adventure/bullseye`, `husbandry/breed_an_animal`, `husbandry/tame_an_animal`,
`husbandry/fishy_business`, `nether/brew_potion`, `nether/create_beacon` and
`story/cure_zombie_villager` are among them.

The missing subsystems are the whole explanation. There is no status effect system, so
`effects_changed`, `levitation` and `used_totem` cannot fire. There is no brewing, beacon, fishing,
breeding, taming, riding, trading, shearing or sleeping. There is no recipe book, so
`recipe_unlocked` has nothing to unlock, and no container loot generation, so
`player_generates_container_loot` has nothing to report.

The single most important trigger is wired. `inventory_changed` carries 1914 of the 4045 criteria,
and it is how nearly every "get this item" advancement is earned, including the ones a player gets
for breaking a block, because Java has no "broke a block" trigger at all. It is also the engine's
worst dispatch: no field of that trigger names a registry element to key on, so one event evaluates
all 1914 criteria in its bucket. The three recipe triggers and
`player_generates_container_loot` are indexed by the element their event names, so a
`recipe_unlocked` event evaluates one criterion rather than 1739.

Completion is announced to the world with Bedrock's `chat.type.achievement` key. The name in it is
the advancement's translation key or its id, because a Java advancement's title names a string like
`advancements.story.mine_stone.title` and a Bedrock client has no such string.

Of the four reward hooks the engine declares, only `grantExperience` is bound. Vanilla uses
`experience` on 23 files and `recipes` on 1739, and the recipe rewards report a warning instead of
being paid.

## Enchantments

`@jsprismarine/enchantments` holds the 43 vanilla definitions, all 31 effect component types, the
enchanting table draw and the anvil. Every rule is ported from the 26.3 jar, and the table and anvil
tests check against values a Java program produced from the real `java.util.Random`.

### What runs in the world

The server reads four of the 31 effect components today.

`damage_protection` becomes the Enchantment Protection Factor of everything worn, folded one
equipment slot at a time from zero, which is what makes four pieces of Protection IV four
applications rather than one. Protection, Fire Protection, Blast Protection, Projectile Protection
and Feather Falling declare it, and each states for itself which damage it answers through a
`damage_source_properties` requirement: Protection answers anything not tagged
`#minecraft:bypasses_invulnerability`, Fire Protection only `#minecraft:is_fire`, Feather Falling
only `#minecraft:is_fall`. Those are tag lookups on the damage source, so the source's tags have to
be filled in or none of them matches.
`damage` and `knockback` are read off the weapon in the attacker's main hand: Sharpness, Smite,
Bane of Arthropods, Impaling and Power for the first, Knockback and Punch for the second. All three
components evaluate in the `enchanted_damage` key set with the *victim* as `this_entity`, which is
Java's arrangement and the reason Smite can ask whether what it is hitting is undead.

`attributes` is how eight of the 43 work: Aqua Affinity, Blast Protection, Depth Strider,
Efficiency, Fire Protection, Respiration, Sweeping Edge and Swift Sneak. Efficiency has no "mining
speed" effect; it has an `add_value` modifier of `levels_squared` on `minecraft:mining_efficiency`,
and `Item.getMiningSpeed` adds that attribute to the tool's speed. Reading it through the effect
component rather than from a table of levels is what makes a datapack that edits `efficiency.json`
take effect.

Fortune, Looting and Silk Touch run through the loot grammar instead of through their own files.
`fortune.json` has no `effects` key at all; its bonus lives in the block tables, which name
`minecraft:fortune` in 32 `apply_bonus` calls and 35 `table_bonus` conditions. All those need is the
level on the tool.

The other 27 components parse and resolve but have no call site in the server yet, so
`post_attack`, `item_damage`, `tick`, `location_changed`, `hit_block` and the rest do nothing.

### The table and the anvil

The enchanting table reproduces Java's draw: `enchantmentCost` for the three row costs,
`selectEnchantments` for the picks, all three rows driven from one generator seeded with the
player's own enchantment seed. That seed is what makes the rows stay put while a player puts an item
in and takes it out again, and it is rerolled once something is enchanted. Bookshelf power is
counted by Java's rule, which checks that both the block beside the table and the block above it
are empty before counting the shelf two out, so a shelf stops counting when something is put in the
gap.

The anvil is `AnvilMenu.createResult` step for step, including the prior work penalty carried on the
result as `minecraft:repair_cost` and written back as `max(base, addition) * 2 + 1`. Renaming is the
exception that does not raise the penalty and caps at 39 levels instead of being refused.

### The deliberate gap: Breach

`armor_effectiveness` is the one effect component the server will not apply. Breach is the only
enchantment that declares it, and whether Java multiplies the result against the armor value or
against the armor toughness is not stated in the file and not settled by this repository's pinned
sources. A fold applied to the wrong term would be worse than the gap, so the component is left out
and the reason is recorded at the top of `packages/prismarine/src/enchantment/values.ts`.

## Predicates and item modifiers

`@jsprismarine/predicates` is the shared grammar underneath loot, advancements and enchantments.
It implements all 20 `loot_condition_type` members and all 42 `loot_function_type` members of
26.3, plus 23 int providers, 28 float providers, 23 of the 25 entity sub-predicates, and the level
based value types. Parsing never throws. A fault lands in a `DiagnosticCollector` and the
evaluation gives the safe answer instead.

26.3 reshaped composition, and this is the change most likely to surprise you if you are working
from older documentation. Every field of a composable type now accepts four forms: an inline value,
a namespaced id naming an element of the matching registry, a list mixing both, and a `#`-prefixed
tag id. One helper implements the rule for all eight composable registries.

```json
{ "condition": "minecraft:tool/can_silk_touch" }
{ "condition": [{ "type": "minecraft:survives_explosion" }, "minecraft:tool/can_shear"] }
{ "modifier": [{ "type": "minecraft:set_count", "count": 2 }, "example:bonus"] }
```

A list of conditions reads as an `and` and a list of modifiers applies in order. The same rule
removed the old `reference` condition and function, renamed `block_state_property` to `match_block`,
split `value_check` into `int_value_check` and `float_value_check`, and renamed `functions` to
`modifier` and `conditions` to `condition` throughout. A reference that leads back to where it
started reports a cycle instead of recursing.

The context key set is checked. `CONTEXT_PARAMETER_SETS` holds the 31 sets of 26.3, and reading a
parameter the declared set does not provide reports

```
the chest loot context does not provide block_state
```

and yields undefined, so a predicate attached to the wrong table fails loudly rather than quietly
passing.

## Tags

The vanilla datapack ships 883 tag files over 20 registries. The big ones are `block` with 300,
`item` with 236, `worldgen/biome` with 86, `villager_trade` with 73, `entity_type` with 49 and
`damage_type` with 36.

Tags are the one registry that merges instead of replacing. The loader concatenates a later pack's
`values` onto the earlier ones, in stack order, and a file that sets `"replace": true` discards
everything earlier packs contributed before adding its own. That is vanilla Java's rule applied
unchanged, and it is what lets you add one item to `#minecraft:planks` with a three-line file.

After merging, the server splits the tags back apart by tagged registry and expands every
`#namespace:tag` member into that tag's own members, transitively. A member written as
`{ "id": "...", "required": false }` disappears without a report when nothing provides it. A
reference that closes a cycle is dropped and reported as `tag.cycle` rather than thrown, so one bad
pack cannot stop a load.

Tags resolve at parse time, which is where Java resolves them. Recipes in particular read their
`#tag` ingredients when they are parsed, so reloading tags means reparsing the recipes.

## Overriding vanilla

A datapack of yours is the last member of the stack, so it wins. The mechanics are the ones you
already know from Java, with one difference worth stating up front: outside tags, nothing merges. A
later file replaces the earlier one whole, so you cannot override one pool of a loot table or one
field of an enchantment. Ship the complete file you want.

To add a datapack, point `content-datapacks` at its directory:

```yaml
content-packs: true
content-datapacks:
    - worlds/world/datapacks/gameplay-tweaks
```

Its `pack.mcmeta` has to cover data pack format 121.0, which is what Java 26.3 declares. Both the
current and the legacy spellings parse:

```json
{ "pack": { "description": "Gameplay tweaks", "min_format": [121, 0], "max_format": [121, 0] } }
```

A pack whose declared range does not cover 121.0 gets an error diagnostic and still loads, unless
`content-strict` is on, in which case the load fails.

Files route into registries by the 26.3 singular directory names under `data/<namespace>/`:
`loot_table`, `recipe`, `advancement`, `enchantment`, `damage_type`, `predicate`, `item_modifier`,
`function` and `tags`. A pack written with the pre-1.21 plural names will not route and is silently
skipped, which is the most common reason an override appears to do nothing. The identifier comes
from the path, so `data/minecraft/loot_table/blocks/gravel.json` registers as
`minecraft:blocks/gravel` whichever pack it came from, and that is why writing to a `minecraft`
namespace is how you replace a vanilla file.

### A worked example: changing gravel's flint curve

Vanilla's `minecraft:blocks/gravel` drops flint through a `table_bonus` condition on
`minecraft:fortune` with chances `[0.1, 0.14285715, 0.25, 1.0]`, wrapped in an `alternatives` that
hands back plain gravel when Silk Touch is on the tool. Say you want a quarter of bare-hand breaks
to yield flint instead of one in ten, with the Fortune curve raised to match. Make a datapack with
two files:

```
gravel-flint/
    pack.mcmeta
    data/minecraft/loot_table/blocks/gravel.json
```

`pack.mcmeta` is the one above. The loot table is vanilla's file with one array changed:

```json
{
    "type": "minecraft:block",
    "random_sequence": "minecraft:blocks/gravel",
    "pools": [
        {
            "rolls": 1,
            "entries": [
                {
                    "type": "minecraft:alternatives",
                    "children": [
                        {
                            "type": "minecraft:item",
                            "name": "minecraft:gravel",
                            "condition": "minecraft:tool/can_silk_touch"
                        },
                        {
                            "type": "minecraft:alternatives",
                            "condition": { "type": "minecraft:survives_explosion" },
                            "children": [
                                {
                                    "type": "minecraft:item",
                                    "name": "minecraft:flint",
                                    "condition": {
                                        "type": "minecraft:table_bonus",
                                        "enchantment": "minecraft:fortune",
                                        "chances": [0.25, 0.5, 0.75, 1.0]
                                    }
                                },
                                { "type": "minecraft:item", "name": "minecraft:gravel" }
                            ]
                        }
                    ]
                }
            ]
        }
    ]
}
```

The bare id in `"condition": "minecraft:tool/can_silk_touch"` is the composition rule at work: it
names a file in the vanilla datapack's `predicate/` folder, which is still loaded underneath yours,
so you do not have to copy the Silk Touch check.

Here is the path that file takes. The loader routes it to `lootTablesJava` under
`minecraft:blocks/gravel` and, because your pack sorts after the vanilla datapack, it replaces
Mojang's file whole. The content build hands the whole registry to `LootRegistry`. On first use,
`blockLoot.ts` walks every `minecraft:blocks/...` id, resolves `minecraft:gravel` through
`javaBlockStateToBedrock`, and records that the Bedrock block `minecraft:gravel` rolls your table.
When a player breaks gravel, `blockBreak.ts` rolls it with the held stack as `tool`, and
`table_bonus` reads the Fortune level off that stack's `minecraft:enchantments` component.

Rolled 4000 times per case against the real evaluator, the vanilla table yields flint on 10.4% of
bare-hand breaks and 14.7% with Fortune I. The override yields 25.8% and 49.4%. Fortune III is
certain in both, because the fourth chance is 1.0, and Silk Touch yields gravel in both, because the
first alternative still matches. Parsing reports nothing.

### What happens on a conflict

Two packs that write the same identifier do not merge: the later one wins and the earlier file is
gone, with no diagnostic, because this is the intended way to override. Two packs that write the
same tag both contribute, in stack order, unless the later one sets `replace`.

Turn `content-strict` on while you are developing. A strict load throws `PackLoadError` as soon as
anything reports an error, and the exception carries the whole report, warnings included, which
turns a quietly skipped file into a failure you can see. Warnings alone never fail the load.

## The seam: a Java identifier with no Bedrock mapping

Java data references Java identifiers everywhere, and the server's registries are keyed by Bedrock
ones. A reference that resolves to neither a Bedrock identifier nor a reviewed loss is a hole, and
the loader refuses to start rather than build content around it.

`checkIdentifiers` runs once per content build, before any domain resolves. It walks every reference
the loaded stack makes, resolves each through the mapping tables, and keeps the ones that come back
`unknown`. In strict mode it throws `UnmappedIdentifierError` carrying the full list, not a sample.
Without strict it builds anyway and reports one error-severity diagnostic per identifier:

```
minecraft:ruby_ore is a Java item identifier with no Bedrock mapping and no reviewed loss entry;
1 reference(s) to it will not reach a client
```

Reporting rather than refusing is the deliberate default. A server that would otherwise run should
run, and the operator should be told exactly what will be missing.

A reviewed loss is not reported at all, because it is already written down with a reason and a
reference in `@jsprismarine/mapping`'s loss list, and the parity dashboard counts it from there.

The vanilla datapack is total. It makes 4088 distinct identifier references over 21 registries and
leaves none unresolved: 3977 resolve to a Bedrock identifier and 111 land on a reviewed loss row.
The losses are concentrated in registries Bedrock has no equivalent for at all, 47 painting
variants and 42 banner patterns among them, plus a handful of individual rows: 8 instruments, 5
biomes, 3 entity types, 3 items, 2 blocks and `sweeping_edge`. Of the 4088, 359 are closed inside
the pack stack rather than against Bedrock, 298 of them tag references, because those never cross
to a client.

`packages/mapping/src/vanillaIdentifiers.test.ts` pins all of it, and
`packages/prismarine/src/content/unmappedIdentifiers.test.ts` pins the refusal.

## Known limits

Things that will not take effect, in rough order of how likely you are to hit them.

**No item NBT reaches the client.** The server writes every item stack with a null user data blob,
so enchantments, custom names and lore never appear on a stack client-side, whether the enchantment
maps to Bedrock or not. The server-side mechanics all run; the display does not.

**A datapack enchantment has no Bedrock slot.** A Bedrock client only knows the enchantments its own
registry lists, and no packet teaches it a new one. That covers `sweeping_edge`, which is Java's one
enchantment with no Bedrock id, and every enchantment a datapack adds. `projectToBedrock` in
`@jsprismarine/enchantments` is the answer to this: a lore line naming the enchantment and a forced
glint, so an enchanted item does not look plain. It is implemented and tested, and nothing in the
server calls it yet. Either way the mechanics run, and the client's own anvil and enchanting
previews are wrong whenever a server-side enchantment is involved, so the server sends the result
rather than letting the client compute it.

**27 of the 31 enchantment effect components have no call site.** They parse, resolve and are ready
for an `EffectSink`; nothing in the server supplies one. `armor_effectiveness` is excluded on
purpose, as described above.

**Structure chests stay empty.** The table reference and the per-position seed are written into the
block entity; nothing rolls them.

**Loot rolls get no content view and no enchantment registry.** `LootRegistry` is built without the
optional content options, and the two drop paths pass no `enchantments` view, so the modifiers that
need either fall back. `furnace_smelt` is the one you will notice: 16 vanilla tables use it, which
is why a cow that dies burning drops raw beef rather than steak. The five tables with an
`exploration_map` and the 25 with `enchant_randomly` or `enchant_with_levels` are in the same
position. Each reports a diagnostic and leaves the stack alone rather than failing the roll. Reading
a Fortune or Looting level is unaffected, because the default view reads the
`minecraft:enchantments` component straight off the stack.

**41 of the 58 advancement triggers never fire.** The `recipes` reward on 1739 files is never paid
either. See the advancements section for which triggers are wired and why the rest are not.

**Smithing trim and cooking recipes are held back from the wire.** Protocol 2193's
`CraftingDataPacket` has no list for them. They still match server-side.

**Scripts never run and binary MCB files are skipped.** The loader reads definitions only. See
[using-packs.md](using-packs.md) for the rest of the loader's limits.
