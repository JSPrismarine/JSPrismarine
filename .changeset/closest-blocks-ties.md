---
'@jsprismarine/script-host': patch
---

Pick the blocks `Dimension.getBlocks` returns for `closest` as the pinned Bedrock Dedicated Server does when several lie at one distance: it walks the volume x, then z, then y, and keeps the nearest in a max-heap of the size asked for.
