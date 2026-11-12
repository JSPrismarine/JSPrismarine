---
"@jsprismarine/prismarine": patch
---

An entity query with an infinite or very wide radius finishes. The world's `entities.near` and `entities.countOfType` walked the index's cells, and an infinite radius never stopped walking the dropped-item cells, while a radius of 100,000 blocks visited billions of empty ones. A query whose cells would outnumber the entities now reads each entity once.
