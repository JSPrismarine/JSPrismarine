---
'@jsprismarine/block-behaviors': minor
'@jsprismarine/prismarine': patch
---

`portalCreationSite` now builds where Java's `PortalForcer.createPortal` builds. It visits columns in Java's spiral, so of two equally close sites it keeps the one Java keeps, and walks each column down from its `MOTION_BLOCKING` height. `PortalCreationBounds` takes an optional `border`: columns outside it are skipped, and a forced portal is clamped into it. In a dimension too short for a forced portal between y 70 and `maxY - 10`, `portalCreationSite` returns `undefined` instead of a site outside that range, and a trip into such a dimension fails as it does in Java. Callers that read `.at` must handle the `undefined`.

The package also exports `spiralAround`, Java's `BlockPos.spiralAround`.
