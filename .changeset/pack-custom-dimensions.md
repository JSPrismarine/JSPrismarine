---
'@jsprismarine/packs': patch
'@jsprismarine/prismarine': patch
---

Add the custom dimensions a behavior pack defines in `dimensions/*.json`. `@jsprismarine/packs` loads them into the `customDimensions` registry, and each level adds one as a void dimension with the document's bounds and cloud height, so `world.getDimension('the_sift:dimension')` finds it.
