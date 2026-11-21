---
'@jsprismarine/prismarine': minor
---

Every level has a UUID, `Level.id`, kept in its save, and a save from before gets one on its first load. `LevelOptions` takes the `id` the level is built with, `WorldManager` keys its levels by it and finds one with `getLevelById`, and every lookup by name now compares case-insensitively.
