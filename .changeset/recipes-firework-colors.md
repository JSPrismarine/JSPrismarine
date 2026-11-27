---
'@jsprismarine/recipes': patch
---

Add the `dyeFireworkRgb` lookup to `RecipeContext`. The firework star recipes now color a star with Java's firework color for each dye, as `DyeColor.getFireworkColor` does, rather than with the tint `dyeColorRgb` gives leather.
