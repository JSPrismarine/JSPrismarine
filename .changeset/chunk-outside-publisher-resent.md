---
'@jsprismarine/prismarine': patch
---

A chunk sent outside the radius of the last `NetworkChunkPublisherUpdate` is no longer counted as loaded. The client drops such a chunk, so the server now sends it again when it comes back into view instead of leaving a hole.
