---
'@jsprismarine/prismarine': minor
---

`WorldManager` no longer holds the provider classes and the worldgen data itself. `LevelProviders` keeps the provider classes a level's entry names, and `WorldManager.getProviders()` answers it in place of a `Map`; `addProvider` and `removeProvider` are `getProviders().register` and `unregister`. `WorldgenCatalog` holds the generator factories, Java's worldgen registries and presets, and the terrain cache settings that every level builds from.
