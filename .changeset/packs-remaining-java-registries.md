---
'@jsprismarine/packs': patch
'@jsprismarine/prismarine': patch
---

The pack loader routes the rest of Java 26.3's gameplay datapack registries into `Definitions`: villager trades and trade sets, trial spawners, jukebox songs, banner, decorated pot and trim patterns, trim materials, instruments, the cat, chicken, cow, frog, pig, wolf and zombie nautilus variants and their sound variants, sulfur cube archetypes, timelines and world clocks. The identifier report reads an `id` under `entity` as an entity type, so a trial spawner's mob is no longer reported as a missing item. The composed vanilla prefix cache moves to v11, since a v10 cache holds none of these registries.
