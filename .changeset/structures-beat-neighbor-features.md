---
"@jsprismarine/prismarine": patch
---

Keep structure blocks against features from neighboring chunks. A neighbor's decoration pass runs over bare terrain and never sees the pieces a chunk placed, so ore veins and grass patches reaching across the border replaced fortress walls, stronghold libraries, and village houses. The structure's writes now travel with the chunk's patch and the merge drops inbound writes at those positions, which is the outcome Java reaches in either decoration order.
