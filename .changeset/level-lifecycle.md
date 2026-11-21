---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

Levels have a lifecycle. `WorldManager` loads and detaches levels one at a time, tracks each one as attaching, attached or detaching (`getLevelState`), and announces `levelAttached`, `levelDetaching` and `levelDetached` on the kernel's event bus. `detachLevel` stops the level's scripts, moves its players to the entry level's spawn, then saves and closes it, keeping its files; it refuses the entry level with `EntryLevelCannotDetach` and a level that is not attached with `LevelNotAttached`. A level attached after startup now runs its behavior pack scripts, and a level's scripts are filed under its UUID.
