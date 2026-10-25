---
'@jsprismarine/chunkgen': minor
---

Add `GenerationPool`, a pool of worker threads that runs chunk status bodies.

The pool knows a chunk position and a status name and nothing else about world generation, so
this package still does not depend on the server. A caller names a pipeline module; each worker
imports it once, hands it the pool's setup value, and keeps what it builds for the life of the
worker. That is what makes a worker worth starting, because a seed's noise tables cost 55 to
134 ms and the 7594-entry climate biome source 145 to 345 ms.

A body hands back a payload and the `ArrayBuffer`s inside it, and the pool transfers them rather
than copying: 18 microseconds for a 192 KiB column against 76 cloned and 1370 as a `number[]`.

`Math.random` is shadowed inside the worker and throws rather than answering. It is seeded
independently per V8 isolate, so a main thread and six workers produce seven different sequences
and a decorator that reached for it would give a different world depending on which worker ran
the chunk. Everything random in Java's world generation is positional and derived from the seed,
so there is nothing legitimate to break.

Only a status that writes radius 0 belongs here. `terrain` is one, which is why Java sends it to
a thread pool and keeps `features`, which writes radius 1, on a single executor.

The tests run real worker threads rather than a double, because the properties worth holding are
properties of the boundary: the pipeline is built once per worker and not once per task, a body
that throws rejects its task instead of leaving it outstanding, a closed pool says which chunk it
refused, and the answers are the same at one, two, four and six workers with the requests in a
different order each time.

`@jsprismarine/chunkgen` now depends on piscina.
