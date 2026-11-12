---
"@jsprismarine/prismarine": patch
---

Share the input step's budget across connections. A step now takes one held input from each connection in turn instead of the oldest inputs first, so a client that floods input-lane packets no longer delays other players' inputs by whole ticks. Each connection's inputs, and its player's removal after them, keep their arrival order.
