---
'@jsprismarine/prismarine': patch
---

`ChunkScheduler.tick` no longer spins when every player's next chunk has to wait for generation depth. A deferred chunk reset the count of players with nothing to send, so two or more players behind a full depth kept the pass going until the 5 ms budget ran out, every tick. With an injected clock that never advanced, it never ended at all. This happened on two-core hosts, where the default depth is two. A full round of deferrals now ends the pass, and a chunk held for a sender without `enqueue` returns to the front of its queue.
