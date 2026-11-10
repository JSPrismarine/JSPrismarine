---
"@jsprismarine/prismarine": minor
---

Chunk completions are inputs. A chunk that has been read or generated, and one whose unload has been saved, waits until the next tick's input step before it enters or leaves the world, so a tick never sees the loaded set change in its middle. The step admits up to `CHUNK_ADMISSION_BUDGET_PER_TICK` completions, after the held packets, and lights each entering chunk, scans its fluids and creates its entities as part of the admission instead of deferring that work to the 2 ms completion slice, which now bounds only the preparation of a chunk, such as translating a worker's result. `ChunkCompletionQueue.admissions` records each admission with its tick and a digest of the chunk's content, and replays a recorded trace so a replay admits exactly the recorded completions at the recorded ticks. A chunk that code inside a tick waits for is still admitted at once; `IN_TICK_CHUNK_LOADS` lists the paths that do this, and `ChunkAdmissions.snapshot().admittedInTick` counts them.

The `Server` constructor takes `chunkAdmissionBudget` to change that count, which a replay harness uses to show that a recorded trace, not the budget, decides what a replay admits.
