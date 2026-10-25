---
'@jsprismarine/prismarine': patch
---

Stop a shutdown waiting on terrain it is about to throw away.

`World.disable` stopped the preload at its next batch boundary, and a batch is thirty-two chunks
asked for in one turn and answered one at a time, so the shutdown waited out whichever batch it
landed in. Measured in a terminal at `preload-radius: 24`, with one Ctrl+C eight seconds into the
preload: the preload ran for another 22.5 s and the process exited 29.8 s after the keypress.

`Generator.stopGenerating` is new and optional. `GeneratorManager` registers it with
`Server.releaseOnShutdown`, so it runs at the top of a shutdown before anything is awaited.
`DataDrivenGenerator` reads it where a request reaches the front of its queue, so the chunk it is
generating finishes and every request behind that one rejects with `GenerationStopped`. The start
region counts those as chunks it did not prepare and stops inside the batch rather than at the end
of it. The same keypress now stops the preload in 1.6 s and exits in 2.3 s.

A chunk is never persisted half built. `LevelDB.readChunk` hands a generated chunk straight back
without writing it, `World.loadChunk` only puts it in the world's map once generation has returned,
and the shutdown's save walks that map, so a refused chunk is one the world never had.

An interrupted spawn search now leaves the spawn unresolved instead of taking the fallback.
`findSurfaceSpawn` answers with the origin for a world that has no dry land within range, and
`World.enable` reads the saved spawn back on the next start, so writing the fallback for a search
that was cut short would have made one dev restart permanent.
