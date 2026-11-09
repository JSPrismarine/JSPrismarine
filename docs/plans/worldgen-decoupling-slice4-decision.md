# Slice 4 decision: no shared work board yet

[worldgen-decoupling.md](worldgen-decoupling.md) says slice 4 is worth doing only if slice 0's task durations show enough tasks longer than about 10 ms that an arriving `immediate` task waits noticeably, or if tick stalls leave workers idle. This note records the data and the decision. The figures are from [worldgen-decoupling-baseline.md](../research/worldgen-decoupling-baseline.md), taken at load averages of 3 to 6.

## The data

- Every `terrain` task is longer than 10 ms at one worker and at six, with means of 29 to 74 ms and a worst case of 430 ms.
- `features` tasks are short with one worker (mean 8.5 to 9.8 ms, 11 to 20% over 10 ms) and long with six (mean 30 to 37 ms, all over 10 ms). CPU time per task rises with the worker count, so some of the growth is contention, not longer work.
- The tick's own work stayed small during a full-speed preload: mean 1.3 to 2.0 ms, 99th percentile 6 to 15 ms against a 50 ms period.
- Lateness at the 99th percentile rose to 250 to 390 ms during the preload, with or without a host process, and the tick's work did not grow. Something holds the event loop between ticks. The runs do not say what, and the control run with no generation also reached 268 ms once.

## Why that does not justify the board

The board fixes one thing: workers that wait for the main thread to hand them the next task. The research note measured that cost as the main thread's stall divided by the task length, and showed it large only when the tick holds the thread for most of its 50 ms and tasks are 10 ms or less. Here tasks are mostly 30 ms or more, and the tick holds the thread for a few milliseconds. Nothing in the data shows workers idle behind the main thread. The throughput per worker count (chunks per CPU-second falling as workers are added) points at contention between workers, which a board does not change.

The `immediate` backlog waits in the task table (90 to 266 ms) come from `bench:chunks` asking for 64 chunks in one burst, not from a player arriving behind a long task, so they do not measure what slice 4 would fix.

## What would change the decision

- A bot fleet run, which I could not complete with a preload: ticks under real player load. If their 99th percentile nears 45 ms while workers sit idle with tasks queued, the board is justified.
- An `immediate` arrival measured behind a running `terrain` task under that load, with a wait well above one task length.
- Short tasks becoming the goal in themselves. Splitting `terrain` and `features` into 5 to 10 ms tasks is a separate decision from the board, and the order-independence digests already allow it. The data above shows the terrain tasks are the long ones.

No prototype was built.
