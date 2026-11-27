---
'@jsprismarine/prismarine': minor
'@jsprismarine/commands': minor
---

Players now have a recipe book, as in Java. The Bedrock recipe book shows only the recipes a player has unlocked, so filtering it to craftable recipes no longer lists recipes the player cannot make. A recipe is unlocked by `/recipe give` or by an advancement's `rewards.recipes`, which is how vanilla's `recipes/` advancements unlock a recipe once the player holds one of its ingredients. Each unlock raises the `recipe_unlocked` trigger. The book is saved in the player record as `recipeBook`, and a record saved before this change gets the recipes its completed advancements reward.

Crafting table recipes go out in `CraftingDataPacket` with an unlocking requirement the client does not meet on its own, and the server sends the book with `UnlockedRecipesPacket` at join and after every change. `NetworkContentPayloads` has a new `bookEntriesByRecipe` map, `SessionPresenter` has a new `showRecipeBook` method, and `BedrockPresenter` takes an optional second argument that names each recipe's book entries.

`ServerCommandHost.recipes` in `@jsprismarine/commands` now returns one `RecipeChange` per player instead of a count, and `/recipe` gives Java's feedback: the number of recipes unlocked or taken, and the player's name when only one player's book changed. Naming a recipe the book does not hold answers `Unknown recipe: <id>`.
