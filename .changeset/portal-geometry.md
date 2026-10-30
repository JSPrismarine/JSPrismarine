---
'@jsprismarine/block-behaviors': patch
---

Add `rules/portal.ts`, the portal geometry rules: Java's `PortalShape` frame scan, the end portal frame ring match, the `PortalForcer` creation search and the portal and End platform writers. `portalFamily` lights a frame when fire appears inside it, collapses a portal when a frame block goes, fills a complete end portal ring with `end_portal`, and rolls the zombified piglin spawn on a portal's random tick. Travel between dimensions stays with the server.
