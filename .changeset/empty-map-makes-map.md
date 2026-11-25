---
'@jsprismarine/prismarine': patch
---

Using an empty map makes a blank map of the area the player stands in, as Java's `EmptyMapItem.use` does: zoom 0, centered on the map grid cell of the player's block, tracking its holders. The last empty map in the hand becomes the map; otherwise the map goes into the inventory, or on the ground when it is full. `Level.addMap` saves a map under a fresh id.
