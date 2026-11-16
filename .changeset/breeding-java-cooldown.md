---
'@jsprismarine/prismarine': patch
---

Make a pair of animals wait Java's 6000 ticks before breeding again when their type names no `breed_cooldown`, which no vanilla file does; they waited 1200. Breeding a type whose `minecraft:breedable` causes pregnancy (turtle, frog, sniffer) now runs the parent's pregnancy event so it lays eggs or frogspawn, instead of spawning a baby on the spot.
