---
'@jsprismarine/script-host': patch
---

Walk a block volume in time that grows with its size rather than its square. Each `BlockLocationIterator.next` parsed and wrote back every location the iterator had left, and `fillBlocks`, `containsBlock` and `getBlocks` walked their volume through that iterator. The Sift's portal check over a large volume held one tick for 26 seconds. The iterator now keeps its volume and a position, and those members read a `BlockVolume` or `ListBlockVolume` from its state.
