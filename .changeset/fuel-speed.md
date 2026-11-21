---
'@jsprismarine/items': patch
'@jsprismarine/prismarine': patch
---

Cook in a smoker or blast furnace twice as fast as in a furnace, as Java 26.3 does: Java gives those recipes a furnace's cooking time and divides it by the burning fuel's speed multiplier, which the new `speedMultiplierOf` reads. A burn time now truncates its integer division as Java's does, so a dried kelp block burns 2000 ticks in a smoker rather than 2001.
