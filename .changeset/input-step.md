---
"@jsprismarine/prismarine": minor
---

Apply input-lane packets in the input step at the start of a tick. A packet whose handler declares the `input` lane is held when it arrives and applied before any world updates, in arrival order, at most `INPUT_ADMISSION_BUDGET_PER_TICK` per tick, so no handler runs in the middle of a world's update. A player's removal after its connection closes is held the same way. Connection-lane and read-lane packets still run on arrival, except behind an earlier input from the same client, which they no longer overtake. A recorded packet now carries the tick its handler ran in, which for an input is the tick that applied it.

`replayInboundRecord` now takes a record before its tick runs and settles once the record's handler has run. The worker transport's records are polled at the end of a tick instead of the start, so they reach the next input step as socket frames do. `TickerServer` gains `admitInputs`, and `Networking` gains `admitInputs` and `isInboundSettled`; an implementation of either interface has to add them. A shutdown applies the inputs still held before it kicks the players.
