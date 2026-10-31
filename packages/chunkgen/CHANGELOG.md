# @jsprismarine/chunkgen

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`99d3b92`](https://github.com/JSPrismarine/JSPrismarine/commit/99d3b92dbd5aaf8df7af54d3a7fee60f7b4da33c) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `GenerationPool`, a pool of worker threads that runs chunk status bodies.
  
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

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`8ea92d7`](https://github.com/JSPrismarine/JSPrismarine/commit/8ea92d76a3d9a95ef2898a07242538556eca5f71) Thanks [@filiphsps](https://github.com/filiphsps)! - `GenerationTask` gains a required `dimension`, the Bedrock id of the dimension the chunk is in,
  and `ShardedGenerationPool` mixes it into the shard hash. A pool shared between dimensions no
  longer sends chunk (0, 0) of the Overworld and the Nether to the same worker. The Overworld's term
  in the hash is zero, so every Overworld region stays on the worker it had, and a test pins that
  mapping. The worker pipeline may ignore the field; `@jsprismarine/prismarine` fills it from the
  generator's dimension definition.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`809b151`](https://github.com/JSPrismarine/JSPrismarine/commit/809b15120f5dac495a25bb6974bc5e1c9f4912d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a tree whole where it crosses a chunk border.
  
  The generator decorated a three by three window and kept only the middle chunk, so whatever a
  neighbor's feature pass wrote across the border was thrown away. A chunk generated on its own never
  received it. Measured at seed 987654321, chunk -96,48: an oak whose trunk stands in the last column
  of -97,48 had air where its crown should be, from y 126 to y 130.
  
  The decoration pass is the `features` status of the ladder now, and the promotion to a Bedrock chunk
  is `full`. A chunk's blocks are its terrain tile, then its own feature writes, then the eight
  inbound patches in `FEATURE_PATCH_ORDER`, which is `(dx, dz)` ascending with `dx` fastest. The
  terrain tile is written once and read by up to nine feature passes; nothing writes into it again,
  and nothing is replayed into a chunk already handed out.
  
  That is what makes a chunk a function of the seed and its position. The caches it replaces made it a
  function of what else the generator had produced: cross-border output was replayed into terrain
  built later and into chunks already returned, so the same chunk differed depending on what was asked
  for around it and changed under a player who already had it.
  
  The border moves once, for every world. Measured over the generation corpus, between 1.4% and 1.9%
  of a decorated chunk's positions gain a block, concentrated at the chunk edge and thinning inward:
  ore and stone blobs, gravel and dirt patches, amethyst geodes and tree crowns that start in the
  chunk next door. Terrain, biomes, structure placement and the structure beards are untouched.
  
  Two consequences for anyone running the server. Asking for one chunk on its own costs more, because
  it cannot be finished until its eight neighbors have decorated: twenty-five terrain tiles and nine
  feature passes where the old shape drove nine and one. Filling a region pays once per tile instead.
  And `@jsprismarine/chunkgen`'s holder, holder map and scheduler now take the chunk type as a
  parameter, defaulting to `ProtoChunk`, so a server can climb the ladder with a chunk buffer of its
  own.

### Patch Changes

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`182066c`](https://github.com/JSPrismarine/JSPrismarine/commit/182066cbdd69eb2fcbe6456efc3c4c31462db59e) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the chunk generation pool inside the Bun-compiled executables.
  
  A compiled binary refused the worker pool outright, so every published executable generated
  terrain on the server thread. Bun does run workers in a compiled binary when their entry
  modules are passed as extra compile entrypoints, so the build now embeds the generation worker
  and both pipeline modules beside the server and tells the pool where they landed through
  `JSP_EMBEDDED_*` defines, the same mechanism as the build metadata. The pool refuses only a
  binary compiled without them, which is what Node's single executable still is. Bun names an
  embedded entrypoint by its path relative to the entrypoints' common directory, which is
  observed behavior rather than documented, so the build verifies the names it compiled in and
  fails loudly if a Bun release changes the scheme.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`2ea0264`](https://github.com/JSPrismarine/JSPrismarine/commit/2ea0264cadb5621e9b4e5f8eff140df570366a76) Thanks [@filiphsps](https://github.com/filiphsps)! - Give the Bun-compiled executables the Bedrock and Java data they run on.
  
  The release and nightly workflows compile the published executables with `bun build --compile`,
  not with Node's single-executable packager, and those binaries did not start at all: `node:sea`
  is imported at the top of `GenerationPool`, Bun implements no such module, and resolving it
  throws `No such built-in module` before anything runs. The runtime checks that ask whether this
  process is a compiled binary now answer for Bun as well, without naming a module Bun cannot
  resolve, and the data a packaged binary unpacks on first run travels inside the Bun executables
  too — through module source, which is what `bun build --compile` carries, since Bun has no asset
  table to read back. Both packagers now collect that payload through one builder, so what the two
  kinds of executable ship cannot drift apart.
  
  Two name lookups that a bundler breaks are fixed with it. A packet's wire id and its codec
  override were both resolved from `constructor.name`, and a bundler renames a class whose name
  collides with another in the same chunk: the compiled binary ended up with a `DeathInfoPacket2`
  and refused to register it. Both now resolve through the packet barrel's export keys, which are
  property names that survive bundling. The override lookup silently missing would have sent a
  2225 session the 2193 layout of every packet whose layout changed.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`efe67c0`](https://github.com/JSPrismarine/JSPrismarine/commit/efe67c07af9bf5f951666e0fdaea628aecb3d728) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate whole chunks in worker threads, and serve the chunks somebody is waiting on first.
  
  Measured over a contiguous 24 by 24 block of overworld chunks on an Apple M1 Pro, eight cores:
  one thread builds a chunk in 427.8 ms, six workers running only `terrain` in 237.4, and six
  workers running the whole ladder in 124.7. The middle row is where this server was. `terrain` is
  71 of the 239 ms a chunk costs and it was the only status that left the server thread, so the
  decoration pass, the structure layout and the merge stayed serial and no worker count could take
  the pool past 1.33 times.
  
  A worker now climbs the whole ladder and hands back the merged region; only the Bedrock
  translation stays on the server thread, because it reads this server's mapping tables. That is
  safe because this server's decoration pass is already pure - Java writes a feature through into
  its neighbors, which is why Java keeps `features` on one executor, while here it runs over a
  private view and returns patches. A chunk is therefore a function of the seed and its position,
  and `test/chunkParity.ts` builds chunks both ways and compares the serialized result exactly.
  
  `ShardedGenerationPool` gives each worker a region of the world to own, so the neighbors a chunk
  reads are ones its worker has already built rather than ones it has to build again. A region
  whose owner falls far behind has its overflow taken by an idle worker.
  
  Chunk requests now carry how badly the chunk is wanted. A chunk a player is standing next to is
  `immediate`, one inside half their view distance is `soon`, and the rim beyond it is `idle`; the
  start region preload is `idle` throughout. The pool drains its backlog in that order instead of
  in arrival order, so a player walking into fresh terrain no longer waits behind a preload rim
  that was asked for first. A request that becomes more urgent while it waits is moved up.
  
  A chunk several callers want at once is generated once. `World.loadChunk` read the provider on
  every call, so overlapping requests for one position each built the chunk and each caller got a
  different `Chunk` object; the last to finish won the map, and a block written through one was
  invisible through another.
  
  `/locate structure` answers. A structure's position is a function of the seed and the placement
  grid, so `Generator.locate` finds the nearest one by laying candidates out against the bare noise
  terrain, nearest first, without generating anything.
  
  `World.loadChunk`'s third parameter was an unused `_ignoreWarn` flag and is now the request
  options. A caller passing `true` should pass `{ urgency: 'idle' }` or nothing.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`84c654b`](https://github.com/JSPrismarine/JSPrismarine/commit/84c654beb9c4fc383c167485a558cbd76824e6aa) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the holder, the holder map and the scheduler, which is the shape a chunk is generated in.
  
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`459b7db`](https://github.com/JSPrismarine/JSPrismarine/commit/459b7dbc50083483e4341062bfc6d20a69fd2795) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/chunkgen`, the chunk generation ladder Java Edition 26.3 uses. It holds the ten
  statuses (`empty` through `full`, with `noise`, `surface` and `carvers` already merged into
  `terrain`) as a chain whose `isOrAfter` is an integer comparison, and the step table from
  `ChunkPyramid.GENERATION_PYRAMID`, transcribed call by call out of the pinned server jar. Each step
  declares the status every neighbor at each Chebyshev distance is guaranteed to have reached and how
  far it may write blocks: `terrain` writes radius 0, `features` radius 1, and the other eight keep
  the default of -1, which excludes even their own chunk. `ChunkStep.requireReadable` enforces the
  read window the way `WorldGenRegion.getChunk` does, by throwing rather than returning a chunk at
  the wrong status, so an undeclared input is a crash on the first chunk instead of a difference on
  the thousandth. The accumulated dependencies are the transitive closure a scheduler sizes its
  layers from: one chunk reaching `full` needs radius 11 at `structure_starts`, 3 at `biomes`, 2 at
  `terrain` and 1 at `features`. Tests reproduce both dependency tables cell by cell against the
  research note, and `SAFETY_MARGIN_CHUNKS` lands on Java's 90 only when the accumulated list for
  `full` is exactly 12 long. Nothing imports the package yet; the holder, the scheduler and the
  worker pool land in later slices.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7045f2f`](https://github.com/JSPrismarine/JSPrismarine/commit/7045f2f8fc58cf9296e2a5b52d31f0d54ec83c8f) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ProtoChunk`, the chunk state every status below `full` works on. Storage is a block palette
  with a `Uint16Array` of indices in `GenerationRegion`'s order, the four heightmaps as one
  `Int32Array`, a biome palette with an index array of 4 by 4 by 4 cells, and the block entity and
  entity spawn requests. `transfer()` returns a payload plus the three `ArrayBuffer`s to pass as a
  transfer list, and `adopt()` rebuilds a chunk over buffers that arrived without copying one.
  Measured round trip for a 192 KiB overworld column: 18 microseconds moved, 76 copied, 1370 as a
  plain `number[]`, which is why nothing in the payload is a class instance, a `Map` or a per-block
  object. A chunk refuses to be read after `transfer()` rather than reading the zeros a detached
  buffer holds, and `advanceTo` refuses a status at or below the one the chunk already has, because
  each (chunk, status) body runs exactly once. Heightmaps are stored rather than computed: the
  `MOTION_BLOCKING` predicate needs block facts this package does not hold. Nothing imports it yet.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`7ad1f37`](https://github.com/JSPrismarine/JSPrismarine/commit/7ad1f3794974f484897322173db4385e9dbd8fd2) Thanks [@filiphsps](https://github.com/filiphsps)! - Start generation workers with `tsx` when the pipeline module is TypeScript source and the host carries no ES module loader for them to inherit. A server booted under vitest built its pool from a dev checkout's `.ts` pipeline, and every worker rejected its first task with `ERR_MODULE_NOT_FOUND` at the first extensionless import.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`52eadb2`](https://github.com/JSPrismarine/JSPrismarine/commit/52eadb2560ba6b12082ffff1a0aaf8d6adfb68f8) Thanks [@filiphsps](https://github.com/filiphsps)! - `ProtoEntitySpawn` carries an end crystal's spawn options: the beam target, the base plate flag
  and invulnerability. The fields are optional and additive, and they survive `transfer` and
  `adopt` like the rest of the spawn, so a generated End pillar's crystal keeps its configuration
  across the worker boundary.
