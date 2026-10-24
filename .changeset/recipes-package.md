---
'@jsprismarine/recipes': patch
---

New package: the Java Edition recipe evaluator. It parses all 22 recipe serializers Java 26.3
registers, including the eight `crafting_special_*` types and the four more that are code behind a
parameterized file, and resolves ingredients in all four composition forms (identifier, `#tag`,
list, inline object with component predicates). `matchRecipe` and `createRecipeBook` match a
crafting grid with vanilla's cropping, mirroring and offset placement, plus the furnace,
stonecutter, smithing and brewing stations, and report per-slot consumption and remainder items.
`compileRecipes` translates recipes to Bedrock identifiers through an injected mapper and reports
every reviewed loss and unmapped identifier instead of dropping a recipe silently. Tags, crafting
remainders, item durability and dye colors are injected lookups, so the package depends on no
registry implementation.
