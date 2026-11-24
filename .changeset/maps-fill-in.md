---
'@jsprismarine/prismarine': patch
---

A map held in either hand fills in from the terrain around its holder, as Java's `MapItem.update` draws it, and every carried map shows its holders' markers. The server sends each holder the pixels and markers that changed. A saved map keeps its pixels and whether it is locked and how it tracks its holders; a map saved before this reads as an explorer map whose biome preview is still to draw.
