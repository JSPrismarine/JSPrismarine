---
'@jsprismarine/prismarine': minor
---

Run the `terrain` status in a pool of worker threads.

`DataDrivenGeneratorOptions.terrain` names a built pipeline module and a worker count, and the
`terrain` bodies run there instead of on the event loop. `terrainPipeline.ts` is that module: it
builds one `DataDrivenGenerator` per worker with decoration and structures off and answers a task
by calling the same `buildTerrainTile` the main thread calls. One implementation of the noise
fill, not two, because a second one would be a second world and only a digest would say which.

Only `terrain` goes to a worker. It writes radius 0, its own chunk and nothing else, so two of
them can never touch the same block. `features` writes radius 1 and stays on the main thread with
the holders, the patch merge and the translation to Bedrock runtime ids. That split is Java's and
it is the safety argument for the whole arrangement.

The structure pieces that push a chunk's terrain around are laid out on the main thread and
travel with the task. Laying them out is the expensive half of the structure problem and it is
shared between neighbours through one cache, so repeating it in six workers would cost more than
the fill the worker is there to do. A worker therefore reads no templates and lays out no
structures; it receives the registries as one `SharedArrayBuffer` and parses them in 21.6 ms.

`GenerationRegion` gained `transfer` and `adopt`, so a terrain tile crosses a thread boundary as
its palette and three typed arrays rather than as 98304 block states.

Measured on a 49 chunk fill at seed 1234, three repetitions with the arms interleaved, best of
three, on a loaded host: 2.83 chunks/s inline, 3.26 at one worker, 6.42 at four and 6.33 at six.
The digests of all 49 chunks were identical at every worker count and in both request orders,
row major and reversed.

A generator with no `terrain` option behaves exactly as before. The pipeline module has to be
something a worker thread can `import()` through Node, which means built JavaScript.
