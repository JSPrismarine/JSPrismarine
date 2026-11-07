---
'@jsprismarine/console': patch
'@jsprismarine/console-protocol': patch
'@jsprismarine/prismarine': patch
---

The console follows a server's own tick rate. The `status` message carries an optional `tickRate`, and the server sends it, so a rate set with `/tick rate` reaches the console. The console caps TPS at that rate instead of 20, colors TPS and tick time against it, and draws the TPS page's graph up to the highest rate in the chosen span, so a span that includes a rate change shows the higher one. A console that gets no `tickRate` assumes 20.
