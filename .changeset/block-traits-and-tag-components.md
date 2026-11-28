---
'@jsprismarine/blocks': patch
---

Read a block's traits from format version 1.20.20 on, where they left experimental, rather than from 1.26.20, and fold each `tag:<name>` component into the block's `minecraft:tags`. The Sift's 1.21.80 portal and 1.21.100 slabs lost their trait states, so `BlockPermutation.resolve` refused the portal's `minecraft:cardinal_direction` and the client could not draw them, and its `tag:` components gave its blocks no tags. Closes #3879.
