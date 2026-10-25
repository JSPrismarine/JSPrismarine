---
'@jsprismarine/block-behaviors': patch
---

Stop an extinguished campfire fizzing at every neighbor change. The water check ran whatever state
the campfire was in and played `random.fizz` after it, so a campfire already out under water hissed
again each time anything beside it changed. It now returns when the campfire is already
extinguished, which is the guard the candle rule next to it already had.
