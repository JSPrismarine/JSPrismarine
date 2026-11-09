# Slice 5: the throughput candidate the profile picks first

Slice 5 of [worldgen-decoupling.md](worldgen-decoupling.md) is decided by slice 0's profile, and the plan's rule is that the profile's largest remaining cost goes first. The figures come from [worldgen-decoupling-baseline.md](../research/worldgen-decoupling-baseline.md): `bench:chunks` with the `stages` arm, one worker, 64 chunks, three runs, load average 3.9 to 4.8.

## What the profile shows

Worker CPU per chunk is about 82 ms, which is the 12.2 chunks per CPU-second measured. By status:

| Status | Tasks per chunk | Mean CPU per task | CPU per chunk | Share |
| --- | --- | --- | --- | --- |
| `terrain` | 2.25 | about 30 ms | about 68 ms | about 83% |
| `features` | 1.56 | about 9 ms | about 14 ms | about 17% |

Tasks per chunk is the task count over the three runs divided by 192 chunks. A chunk needs terrain for its neighbors, and tasks counted at a block's edge are shared with the next chunk, which matches ADR 0002's 2.25 tiles per chunk. The server thread adds about 3 ms per chunk for Bedrock translation on a cold start and about 0.5 ms warm, which is small beside the workers' 82 ms and is slice 1's concern.

This contradicts neither source in the plan so much as updates them. ADR 0002 put `features` and the translation at about two thirds of a chunk. With the terrain work since then, `terrain` is now the largest status by a wide margin.

## The pick

**A general range analysis over the density graph goes first.** It targets `terrain`, the status that holds about 83% of worker CPU. The candidates that target `features`, the data-oriented feature world and the footprint analysis, address about 17% of the cost, so even a free `features` pass would raise throughput by under 20%.

Between the two `terrain` candidates, range analysis and generated code, this profile does not separate them. It attributes cost to statuses, not to nodes inside the density graph. Range analysis comes first because it removes work, by proving that a subtree is constant over a region and skipping it, and it needs no code generation step in a package that publishes to npm. Generated code only makes each remaining node cheaper to evaluate.

## First step of the follow-up plan

Take a CPU profile inside one `terrain` task, with the bench's `terrain` arm and the `chrome-devtools` skill, and attribute the time to graph nodes. If a few node kinds dominate and most of the evaluations are over regions where those nodes are constant or monotone, write the range analysis plan. If the time is spread evenly over interpretation overhead, the order flips to generated code. That profile decides between the two, and I have not taken it.

## What this does not cover

CPU time per task grew with the worker count: a `terrain` task took 29 ms of CPU with one worker and 64 ms with six on this machine. A throughput plan has to measure that separately, because cutting work per task will not fix cores that slow each other down.
