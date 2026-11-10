---
"@jsprismarine/prismarine": patch
---

A client's input-lane packets no longer cost a tick each. The dispatcher held a connection's frame queue until the input step had applied each input, so a client that sent more than one input per tick fell further behind every tick, and the sub-chunk requests behind those inputs were answered later and later until chunk loading stalled. Every input a connection sends before an input step is now applied in that step, in arrival order. A connection-lane or read-lane packet that follows a held input runs once that step is over, and does not hold back the inputs sent after it. The phase gate now runs when a packet's handler runs, so a packet that follows the input that starts the game is gated on the `play` phase.
