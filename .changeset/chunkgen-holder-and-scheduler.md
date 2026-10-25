---
'@jsprismarine/chunkgen': patch
---

Add the holder, the holder map and the scheduler, which is the shape a chunk is generated in.

`ChunkHolder` keeps one promise per status for one chunk. The first caller to ask for a status
creates the promise and runs the body; every later caller awaits that same promise, so a
(chunk, status) body runs exactly once however many requests overlap. That is Java's
`GenerationChunkHolder.acquireStatusBump` without the compare-and-exchange, which only exists there
because several pool threads reach `applyStep` at once. A run waits for the parent status's promise
before its body starts, so two statuses of one chunk are never in flight together, and a request
that skips a rung raises `ChunkStepOutOfOrderError` where Java raises `IllegalStateException`.

`ChunkHolderMap` retains holders by reference count. A run acquires every chunk inside its radius
before it runs a step and releases them all when it finishes, so nothing it depends on can be
dropped while it is in flight. This replaces the generator's 128-entry LRU, which `preload-radius:
5` at 121 chunks sat right at the edge of.

`GenerationScheduler` walks the ladder from `empty` upward, applying each step to the square the
accumulated dependency table sizes: 9, 9, 1, 1, 0 for a `terrain` target and 11, 11, 3, 3, 2, 1, 1,
0, 0, 0 for a `full` one. Status bodies are injected through `StepTasks`, because they need the
noise, the biome source and the feature registries, and a status with no body passes its chunk
through. Every body reads its neighbors through `StepRegion`, which refuses an input the step table
did not declare.

Counted rather than asserted in prose: nine chunks asked for at once at a `full` target run 1538
bodies with none run twice, building terrain 49 times where `DataDrivenGenerator.generateChunk`
builds a 3 by 3 tile per chunk and so builds 81. Sixteen chunks come out identical row major,
reversed, shuffled, one at a time and all sixteen at once. Nothing in the server imports this yet.
