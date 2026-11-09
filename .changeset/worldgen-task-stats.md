---
'@jsprismarine/chunkgen': patch
'@jsprismarine/prismarine': patch
---

The generation pool now records, for each status and priority band, how long tasks wait in its backlog, how long they take to come back, and the wall and thread CPU time each worker spent on them. It can also hold its backlog back and release it. The server's tick loop records each tick's lateness, duration and phase times, and the chunk completion queue books the main-thread time of chunk registration, lighting, fluids and entity setup under their own labels. Nothing about generated output changes.
