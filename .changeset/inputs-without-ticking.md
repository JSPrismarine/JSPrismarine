---
'@jsprismarine/prismarine': patch
---

A server started with `enable-ticking` off applies its inputs when they arrive, as it already admitted chunk completions. It held them for an input step that no tick ran, so a client's join stopped at its first input and a closed connection left its player in the world until shutdown. A harness that steps ticks by hand turns the chunk completion queue on with `server.getChunkCompletionQueue().activate()`, as before, and its inputs still wait for the input step of the next tick it runs.
