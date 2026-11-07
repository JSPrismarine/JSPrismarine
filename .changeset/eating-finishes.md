---
'@jsprismarine/prismarine': patch
---

Eating and drinking work. The client reports the start of a meal and never its end, so nothing ever consumed the food: the item stayed in hand and the hunger bar never moved. The server now counts the meal out from the item's `consume_seconds` (1.6 seconds unless the item says otherwise) and, if the same item is still in hand, runs its consume behavior: it feeds the player, applies the effects and spends one item. Letting go of the button cancels the meal.
