---
'@jsprismarine/kernel': patch
'@jsprismarine/console-protocol': patch
'@jsprismarine/prismarine': patch
---

The server reports how far its start has got. `Kernel` takes an `onStart` option that hears each module begin and finish starting; a callback that throws is logged and the start goes on, the console protocol gains a `boot` message carrying each step, and a server with a remote console attached sends one for every step before it reports `running`.
