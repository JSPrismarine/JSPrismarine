---
'@jsprismarine/block-behaviors': patch
---

A brown or red mushroom now survives a neighbor update the way Java's `MushroomBlock.canSurvive` decides: on mycelium, podzol or nylium in any light, and on any other full, opaque block in light below 13. It used to need vegetation soil, so a cave mushroom on stone broke the first time a block next to it changed.
