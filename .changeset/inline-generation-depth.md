---
'@jsprismarine/prismarine': patch
---

Deliver a flat, void or debug world's new chunks without waiting for the worker depth. The chunk scheduler held every chunk that needed generating to twice the chunk worker count, even when the generator builds it on the main thread in a few hundred block writes, so a flat world sent six new chunks a tick on a four-core host however many players were waiting. Generators now say when they build chunks inline, and those deliveries are bounded by the 64 chunks one input step admits.
