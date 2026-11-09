---
'@jsprismarine/prismarine': patch
---

The generator's admission queue now serves chunk requests by urgency, `immediate` first, instead of strictly in arrival order, and a request that becomes more urgent while it waits moves up. A chunk a player was waiting on no longer queues behind every earlier `idle` or `soon` request, and a held-back or slow background backlog can no longer stall a tick that awaits that chunk.
