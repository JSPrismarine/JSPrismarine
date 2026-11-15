---
'@jsprismarine/lighting': patch
'@jsprismarine/prismarine': patch
---

Stop a light read from running every chunk's queued light flood. A random tick on a grass block read light, and the read flushed the whole light queue, so a tick after chunks loaded could run seconds of other chunks' floods. The light engine now counts its queued work by chunk: a read flushes only when its own chunk or a neighbor still has light queued, and a chunk whose light is still flooding is not random-ticked, as Java ticks a chunk only once its light is done.
