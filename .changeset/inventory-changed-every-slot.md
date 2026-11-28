---
'@jsprismarine/prismarine': patch
---

Every change to a slot of a player's inventory, armor or offhand raises the `inventory_changed` advancement trigger, as Java's container listener does. Only a pickup, a craft and `/give` used to raise it, so a stack taken out of a chest or a furnace's output, a creative pick or `/item replace` left the recipe it unlocks out of the recipe book. Closes #3829.
