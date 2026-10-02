---
'@jsprismarine/prismarine': minor
---

Add the `LevelDB` world provider, which stores a world the way Minecraft: Bedrock Edition does — a `db` directory of LevelDB files, a `level.dat` and a `levelname.txt` beside it. A world written by the server opens in the game, and a world made in the game opens on the server.

It reads and writes sub chunks across the whole −64 to 319 range, the `Data3D` biome record, the chunk version and finalized state, and block entities. An all-air sub chunk is stored by not being stored, which is what the game does too. A chunk with no version record is one that was never generated, so the generator is asked for it; anything else is a chunk that exists and is read as best it can be rather than being overwritten with fresh terrain.

Two things it refuses to do quietly. Opening a folder that already holds a Filesystem world logs what it found and starts a fresh database beside the old `chunks` directory instead of over it. And opening a world the game already has open fails outright, because two writers on one LevelDB do not produce a stale read — they rewrite each other's files and the world does not survive it.

`Chunk` gains `markSaved`, without which `hasChanged` only ever went true: every chunk a player had walked through was rewritten on every save for the rest of the session, and a chunk merely *read* from disk was written straight back out. `World` gains `getDimension`. The dangling `@types/level` module declaration, which described a package nothing imported, is gone.
