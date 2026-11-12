---
"@jsprismarine/engine-systems": patch
---

`TickList.restore` reads its queue only when the tick it restores is queued. An undo or a replay restores one tick per logged entry, and each restore read the whole queue, so a span with many scheduled ticks cost the entry count times the queue length.
