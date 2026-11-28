---
'@jsprismarine/blocks': patch
---

A material instance's `ambient_occlusion` may be the older boolean form, which reads as 1 or 0. A pack that wrote `false`, as Bedrock Dynamic Lights does, used to fail `minecraft:material_instances` on all its blocks with a content error.
