---
"@jsprismarine/engine-systems": patch
---

`TickList.restore` reads its queue only when the tick it restores is queued. An undo or a replay restores one tick per logged entry, and each restore read the whole queue, so a span with many scheduled ticks cost the entry count times the queue length. `TickList.schedule` queues a copy of the position it is given, so a caller that changes its own position object afterwards no longer moves the queued tick away from the record `restore` relies on.
