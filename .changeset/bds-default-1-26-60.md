---
'@jsprismarine/bedrock-data': minor
---

Take the default Bedrock data from Bedrock Dedicated Server 1.26.60.6, the release the server advertises, instead of 1.26.51.1, and `bedrock-samples` from v1.26.60.5. The unversioned exports now carry protocol 2225's item table, actor list, jigsaw rules and creative menu. The new `v2193` module carries protocol 2193's, including its jigsaw rules, so a 1.26.51 client is still sent its own numbering, and `v2225` gains `jigsaw_structure_data`. `@jsprismarine/bedrock-data/sources` names the cache folders of the pinned server and samples, and `ensure:bedrock-pack` fetches the pinned server when the cache holds only an older one.
