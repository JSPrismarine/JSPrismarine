---
'@jsprismarine/engine-systems': patch
'@jsprismarine/prismarine': patch
---

Bound the time a world tick spends on scheduled ticks as well as their count, so thousands of due ticks, such as the leaf decay checks of a freshly filled canopy, spread over several ticks instead of stalling one for seconds.
