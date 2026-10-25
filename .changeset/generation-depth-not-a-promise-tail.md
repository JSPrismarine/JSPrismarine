---
'@jsprismarine/prismarine': patch
---

Give chunk generation a depth instead of a promise tail.

Every request used to chain onto `pipeline.generationTail`, so the batch of thirty-two the start
region asks for was strictly sequential: the chunk status ladder's shared-promise path never
fired in the server, and a worker pool fed through this would sit at a depth of one however many
workers it had. `GenerationQueue` replaces the tail with an admission depth, which
`DataDrivenGeneratorOptions.concurrency` sets.

The depth defaults to one, because on one thread building several chunks at once is worse. A 49
chunk fill at seed 1234, three repetitions with depth one and depth six interleaved so a load
spike hits both: 36.8 s against 40.3 s best of three, with depth one ahead in all three pairings
by 9 to 14%. Six half-built chunks hold six feature views and interleave at every terrain yield,
and they share nothing that holder retention was not already sharing. The number exists to be
raised when the terrain bodies run in workers, not before.

Shutdown gets stricter and faster. The tail refused a queued request only when the chunk ahead of
it finished; the queue refuses everything waiting the moment `stopGenerating` is called, and
refuses a world the generator had never been asked about rather than building its first chunk.
Because those refusals now arrive at once, the regression test is shaped like
`World.preloadSpawnRegion` itself, which is the caller that has to catch them: the server runs
with `--unhandled-rejections=strict`, where a refusal nobody is awaiting ends the process.

`ChunkScheduler.tick` can hold several deliveries open instead of awaiting each in turn, which is
the other half of what kept a pool one deep. Its depth also defaults to one and is raised
alongside the generator's, because asking for more while the generator builds one at a time only
parks them in the generator's queue and makes a tick wait for all of them.
