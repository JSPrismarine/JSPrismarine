---
'@jsprismarine/prismarine': patch
---

Stop a world shutdown from racing its own start region. `World.disable` saved the world and closed
the provider while the preload was still generating chunks, so the next chunk request reached a
closed LevelDB and threw "The world provider is not enabled" out of `World.enable` - a rejection
nothing on the startup path catches. Every dev-watcher restart during the 441 chunk preload ended
that way, which is most of them.

`World` now tracks where it is in its own shutdown. `disable` marks the world closing, which stops
the preload at its next batch boundary and stops the tick, waits for the start region work already
in flight so that every chunk it generated is saved rather than dropped, saves, and closes the
provider last.

`saveLevelData` writes the spawn point the world already knows instead of resolving one. Resolving
it searches for dry land, and searching generates terrain, so saving a world used to generate
chunks - from inside the autosave's tick, and from the middle of a shutdown. `World.enable` settles
the spawn once, up front, so there is one to write by the time anything saves. A world whose spawn
is still unknown writes the rest of its level data and leaves the stored spawn where it is.

`savePlayerData` declines once the world has closed. A shutdown kicks everyone, and each client's
connection closes after the world has already saved and gone, so every player produced a "Failed to
save player data" error against a provider that was no longer there.

`Progress.finish` takes an optional note, so a run that stopped early says so instead of reporting
work it never did.
