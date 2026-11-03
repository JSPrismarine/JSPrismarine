# Block-state allocation benchmark

`bench:block-state-allocation` measures the heap retained by a full `buildServerContent()` call and
the CPU used by its `resolveBlocks()` call. It loads the default Bedrock and Java sources, resolves
the 1,477 block definitions against the 22,079-state palette, and uses the built content's behavior
registry, palette, and Java-tag mapper for the resolver measurement.

The heap reading is `process.memoryUsage().heapUsed` after two full GCs, minus the reading after two
full GCs before the build. Each heap sample runs in a fresh process with `--expose-gc`. The resolver
reading uses `process.cpuUsage()` around `resolveBlocks()` directly; its wall time is also printed.
One resolver warmup precedes seven measured calls per process. Pack loading, content construction,
and cache setup stay outside the resolver CPU measurement.

## Measurements

Runs used Node 26.12.1 on macOS 27.2, arm64, Apple M1 Pro, with 16 GB of memory. The default stack
used Bedrock Dedicated Server 1.26.51.1 (protocol 2193) and Java Edition 26.3, with no missing-pack
warnings. Each row aggregates three fresh processes, with one heap sample and seven resolver samples
per process. Heap reports the median of three process readings; CPU reports the median of 21 resolver
readings.

| Revision | Retained heap | `resolveBlocks` CPU |
| --- | ---: | ---: |
| Parent of #2728 change, `3ed804dd50ba506d29e443a999f4dd7c4449c525` | 137,418,720 B (131.053 MiB) | 410.339 ms |
| Current PR head, `f7fe4925d60fd97b80625ca74649a0ec560c8508` | 118,654,776 B (113.158 MiB) | 397.548 ms |
| #2728 change commit, `1b1451d4f7978be941bd627267ce1322f653b1fb` | 107,326,416 B (102.354 MiB) | 346.774 ms |

The current PR head uses 18,763,944 fewer retained bytes (17.895 MiB, 13.7%) and 12.791 ms less
`resolveBlocks` CPU time (3.1%) than the direct parent baseline. The issue commit comparison isolates
the #2728 change: 30,092,304 fewer retained bytes (28.698 MiB, 21.9%) and 63.565 ms less CPU time
(15.5%). The current PR head includes later commits after that issue commit, so its row is reported
separately rather than attributing the full parent-to-head difference to #2728.

The full-state digest in `src/content/blockStateAllocation.test.ts` is
`6694d4cfa8d680caba19e4ca8cc7cc26aa2900b30ab6dbb680b4aad56a900dac` at the direct parent, issue
commit, and current PR head. The previous `658e550f...` literal came from a run with the pinned Bedrock
and Java sources missing from the default stack.

## Reproducing the comparison

Fetch the pinned sources and generate the Java datapack once. `datagen:java` needs JDK 25 or newer.

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/bedrock-data run datagen:java
git worktree add --detach /tmp/jsprismarine-2728-before 3ed804dd50ba506d29e443a999f4dd7c4449c525
git worktree add --detach /tmp/jsprismarine-2728-after 1b1451d4f7978be941bd627267ce1322f653b1fb
mkdir -p /tmp/jsprismarine-2728-before/node_modules
mkdir -p /tmp/jsprismarine-2728-after/node_modules
ln -s "$PWD/node_modules/.cache" /tmp/jsprismarine-2728-before/node_modules/.cache
ln -s "$PWD/node_modules/.cache" /tmp/jsprismarine-2728-after/node_modules/.cache
pnpm --dir /tmp/jsprismarine-2728-before install --frozen-lockfile
pnpm --dir /tmp/jsprismarine-2728-after install --frozen-lockfile
```

Run this command from the worktree that contains the benchmark. Repeat it three times per revision
for independent heap readings. The CPU median uses seven samples from each process.

```sh
BENCHMARK="$PWD/packages/prismarine/benchmarks/blockStateAllocation.mts"
pnpm --dir /tmp/jsprismarine-2728-before --filter @jsprismarine/prismarine exec node --expose-gc --import tsx "$BENCHMARK" --project-root /tmp/jsprismarine-2728-before --samples 7 --heap-samples 1 --warmups 1
pnpm --dir /tmp/jsprismarine-2728-after --filter @jsprismarine/prismarine exec node --expose-gc --import tsx "$BENCHMARK" --project-root /tmp/jsprismarine-2728-after --samples 7 --heap-samples 1 --warmups 1
```

The benchmark prints the selected revision, input counts, per-call CPU and wall time, and heap
readings as JSON. The script accepts `--project-root` to load another reachable worktree's source
while keeping the same runner and sampling settings.
