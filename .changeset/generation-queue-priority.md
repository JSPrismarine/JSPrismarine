---
'@jsprismarine/prismarine': patch
'@jsprismarine/chunkgen': patch
---

A chunk a player is waiting on no longer queues behind background generation. The generator's admission queue serves requests by urgency, admits `immediate` ones past its depth, and moves a waiting request up when it becomes more urgent. A chunk's neighbor terrain and feature tasks now take the band of the most urgent chunk that reads them, where they used to default to `soon`. The generation governor leaves one worker free of background work. The unused pool `pause` and `resume` are removed: holding tasks that hold admission slots stalled the tick.
