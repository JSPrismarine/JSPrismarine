---
'@jsprismarine/worldgen': patch
---

`XoroshiroRandomSource.fromLanes`, which every positional random draw goes through, no longer runs the constructor's BigInt seed checks before it writes its lanes. The draws are the same.
