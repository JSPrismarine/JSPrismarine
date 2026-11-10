---
"@jsprismarine/minecraft": minor
---

Remove `vanillaRecipes`, the recipe list generated from a Bedrock Dedicated Server's behavior packs, along with its generator and the `generate:recipes` script. It fed the legacy recipe manager `@jsprismarine/prismarine` no longer has; recipes come from the pack stack's Java recipe definitions through `@jsprismarine/recipes`.
