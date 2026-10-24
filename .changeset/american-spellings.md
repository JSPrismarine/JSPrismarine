---
'@jsprismarine/client': minor
'@jsprismarine/minecraft': minor
'@jsprismarine/prismarine': minor
---

`Event.isCanceled`, `BlockEntityRegistry.isModeled`, and `EntitySerializer.isModeled` replace their British spellings. Update imports and calls to the American names. `vanillaRecipes` also uses American spellings in its two generated recipe IDs; callers that store those IDs must update them.
