---
"@jsprismarine/prismarine": minor
---

Remove the legacy recipe manager. Crafting runs on the content build's recipe book only: `CraftingDataPacket` is built from it and an `ItemStackRequest` is resolved against it, so the two always agree on net ids. A content build that produced no crafting payload now sends no recipes, where it used to fall back to a second, differently numbered list.

Removed: `Server.getRecipeManager`, `Server.getStationRegistry`, `recipesToken`, `stationsToken`, the `recipeRegister` event and `RecipeRegisterEvent`, and the `crafting/` `RecipeManager`, `Recipe`, `RecipeIngredient`, `VanillaRecipes` and `CraftingStation` modules. Add recipes through a pack's recipe definitions instead.
