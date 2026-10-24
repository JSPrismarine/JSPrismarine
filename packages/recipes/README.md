# @jsprismarine/recipes

The Java Edition recipe evaluator. It reads Java 26.3 recipe files, matches them against what a
player has placed at a station, and compiles them to Bedrock identifiers for the wire. It holds no
registry of its own: tags, crafting remainders, item durability and dye colors all arrive through
injected lookups.

```ts
import { compileRecipes, loadRecipes } from '@jsprismarine/recipes';
import { javaItemToBedrock } from '@jsprismarine/mapping';

const { book, diagnostics, failed } = loadRecipes(definitions.recipesJava, {
    tags: (registry, tag) => registryTags[registry]?.get(tag),
    remainderOf: (id) => items.get(id)?.components['minecraft:crafting_remainder'],
    maxDamageOf: (id) => items.get(id)?.components['minecraft:max_damage'],
    dyeColorRgb: (color) => DYE_COLORS[color]
});

book.match({ station: 'crafting', grid });
// { recipe, result, consumed, remainder }

compileRecipes(book.recipes, javaItemToBedrock);
// { recipes, losses, gaps, dropped }
```

## Coverage

All 22 serializers Java 26.3 registers, verified against
`net.minecraft.world.item.crafting.RecipeSerializers` in the 26.3 server jar and against the 2042
vanilla recipe files, which use every one of them.

| Serializer | Vanilla files | Station | Logic |
| --- | ---: | --- | --- |
| `crafting_shaped` | 827 | crafting | pattern, mirrored and offset |
| `crafting_shapeless` | 375 | crafting | ingredient-to-slot assignment |
| `stonecutting` | 351 | stonecutting | one item in, one out |
| `brewing` | 279 | brewing | input plus reagent, with a potion predicate on the input |
| `smelting` | 73 | smelting | one item, experience and cook time |
| `crafting_transmute` | 33 | crafting | code: input keeps its components, material is counted |
| `blasting` | 25 | blasting | one item |
| `smithing_trim` | 18 | smithing | code: writes `minecraft:trim` onto the base |
| `crafting_special_bannerduplicate` | 16 | crafting | code: copies patterns, returns the source banner |
| `smithing_transform` | 12 | smithing | base components carry into the result |
| `smoking` | 9 | smoking | one item |
| `campfire_cooking` | 9 | campfire_cooking | one item |
| `crafting_dye` | 6 | crafting | code: averages dye colors the way `DyedItemColor.applyDyes` does |
| `crafting_decorated_pot` | 1 | crafting | code: four sherds at the edge-center slots |
| `crafting_imbue` | 1 | crafting | code: eight materials around one source, which carries its potion |
| `crafting_special_bookcloning` | 1 | crafting | code: one copy per blank book, generation plus one |
| `crafting_special_firework_rocket` | 1 | crafting | code: flight duration from the fuel count |
| `crafting_special_firework_star` | 1 | crafting | code: shape, colors, trail and twinkle |
| `crafting_special_firework_star_fade` | 1 | crafting | code: adds fade colors to an existing explosion |
| `crafting_special_mapextending` | 1 | crafting | code: marks the centered map for rescaling |
| `crafting_special_repairitem` | 1 | crafting | code: combined durability plus five percent |
| `crafting_special_shielddecoration` | 1 | crafting | code: banner color and patterns onto a shield |

### What 26.3 moved out of `crafting_special_*`

Older notes list armor dyeing, map cloning, shulker box coloring, tipped arrows and suspicious
stew among the code-only recipes. In 26.3 they are not. Armor dyeing is `crafting_dye`, tipped
arrows are `crafting_imbue`, map cloning and shulker box and bundle dyeing are
`crafting_transmute`, and all 17 suspicious stew recipes are plain `crafting_shapeless` with the
effect in the result's `minecraft:suspicious_stew_effects` component. The eight serializers whose
name still starts with `crafting_special_` are the eight in the table above, which is the same
eight [java-registries-and-components.md](../../docs/research/java-registries-and-components.md)
section 8 lists. Four more types are code behind a parameterized file (`crafting_transmute`,
`crafting_dye`, `crafting_imbue`, `crafting_decorated_pot`), so twelve of the 22 need a real
implementation rather than a field read.

### Ingredient forms

All four composition forms Java 26.3 accepts: an item identifier, a `#tag`, a list of either, and
an inline object naming an `item` plus component predicates. Vanilla uses the inline form only for
the 279 brewing recipes, where it carries a `potion_contents` predicate; that predicate is
implemented against the potion registry, and any other inline component is compared structurally
against the candidate stack's component of the same name.

### What is not here

Recipe book unlocking, the recipe advancement criteria, and the Bedrock `priority` field, which
has no Java source. Brewing matches one bottle slot at a time; the three-slot brewing stand loop
belongs to the block entity.

## The injected seams

Parsing and matching read four lookups, all optional, all on `RecipeContext`. Each one says what
stops working when it is missing, because a caller can start with none of them.

| Lookup | Used by | Without it |
| --- | --- | --- |
| `tags(registry, tag)` | every `#tag` ingredient, at parse time | the ingredient accepts nothing and parsing warns |
| `remainderOf(itemId)` | the craft's leftovers | a milk bucket or a honey bottle vanishes into the craft |
| `maxDamageOf(itemId)` | `crafting_special_repairitem` | the repair recipe never matches, because damageability is what it tests |
| `dyeColorRgb(color)` | `crafting_dye`, the two firework star recipes | dyed armor keeps its old color and a star records none |

Tags resolve at parse time, which is where Java resolves them: reloading tags means reparsing the
recipes.

The Bedrock side is a fifth seam. `compileRecipes(recipes, mapper)` takes the item mapper as an
argument rather than importing one, so this package has no runtime dependency on
`@jsprismarine/mapping`. That package's `javaItemToBedrock` satisfies the `JavaItemMapper` type
structurally, and the tests here run against it as a dev dependency.

Compiling reports rather than drops. A reviewed loss keeps the recipe and is listed in `losses`
with the mapper's reason. An identifier with no Bedrock item at all is listed in `gaps`; it costs
the recipe only when it is the result or when it empties an ingredient, and those recipes are
named in `dropped`. Each compiled recipe also carries the Bedrock block tags its station needs
(`crafting_table`, `furnace`, `blast_furnace`, `smoker`, `campfire` and `soul_campfire`,
`stonecutter`, `smithing_table`, `brewing_stand`), taken from the tags the vanilla Bedrock pack's
own recipe files carry.

## Matching

A crafting grid is cropped to the bounding box of its filled slots before any recipe sees it,
which is what Java's `CraftingInput.ofPositioned` does and what lets a 2x2 recipe match in any
corner of a 3x3 table. The shaped pattern is trimmed the same way when the recipe is parsed,
matching `ShapedRecipePattern.shrink`; seven vanilla recipes, `spyglass` and `mace` among them,
are written with padding columns and would otherwise be wider than any grid they can see. The
pattern is then tried at every remaining offset and in both the written and the left-right
mirrored arrangement. Shaped recipes are always mirrorable and never vertically flippable.

A match reports `consumed` and `remainder` per input slot in the input's own slot order. Both
carry the full grid, not the cropped one. `consumed` is one per filled slot. `remainder` is what
the slot gains afterwards: the item's crafting remainder, or the source stack that banner
duplication and book cloning hand back.

## Ordering and network ids

`orderRecipes` sorts by namespace first, then by path, comparing UTF-16 code units rather than
collating. `localeCompare` puts the same two identifiers in different orders on different
machines, and the plan takes recipe network ids from registry order, so the order has to be a pure
function of the loaded identifiers. Load order, file system order and insertion order are all
excluded for the same reason.

`assignNetIds` numbers the sorted list from 1, because Bedrock reserves 0 for "no recipe". Adding
a recipe renumbers everything that sorts after it, so a client has to be sent a fresh recipe list
after a reload rather than a patch.

## Tests

`pnpm --filter @jsprismarine/recipes test` runs the unit tests: one parse and match case per
serializer, shaped mirroring and offset placement, remainder items, tag ingredients, the four
ingredient composition forms, and the twelve code-logic recipes with real inputs.

A corpus test runs the package over Java 26.3's own 2042 recipe files. It needs the server jar
that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches, so it is gated:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
JSP_VANILLA_RECIPES=1 pnpm --filter @jsprismarine/recipes test
```

It asserts zero parse errors over all 2042 files and that all 22 serializers appear, rebuilds an
input for each recipe from its own ingredients, and reports how many matched and what compiling
the set through `@jsprismarine/mapping` costs. Measured against Java 26.3:

| Measure | Count |
| --- | ---: |
| recipe files read | 2042 |
| parse errors | 0 |
| serializers seen | 22 of 22 |
| inputs rebuilt | 2041 (only `repair_item` names no ingredient to build from) |
| rebuilt inputs the recipe accepts | 2041 |
| rebuilt inputs the book returns that same recipe for first | 1769 |
| compiled to Bedrock | 2042 |
| reviewed losses | 2 (`furnace_minecart` and `spectral_arrow`, both results, both recipes kept) |
| identifiers with no Bedrock item | 0 |
| recipes dropped | 0 |

The 272 inputs the book answers with a different recipe are almost all stonecutting, where
vanilla deliberately offers several results for one input and the player picks at the station.
