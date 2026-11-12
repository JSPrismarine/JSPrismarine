---
'@jsprismarine/client': patch
---

A bot runs one tick at a time. A behavior that waited past the tick interval let the next tick start beside it, so two ticks read the same tick number and sent two inputs with one number. A tick asked for while one runs now waits on it. An input whose send fails no longer loses its teleport acknowledgment: the next input carries it.
