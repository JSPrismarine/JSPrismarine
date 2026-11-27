---
'@jsprismarine/prismarine': patch
---

Furnaces, blast furnaces and smokers pay experience as Java does. Each finished item is tallied by recipe. Taking any part of the result pays everything the furnace cooked since it last paid: for each recipe, the whole points of the item count times the recipe's `experience`, plus one more point by chance for the fraction. Breaking the furnace pays the same at its center. `@jsprismarine/prismarine/world/cooking` is a new entry point.
