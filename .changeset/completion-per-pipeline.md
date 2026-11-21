---
'@jsprismarine/prismarine': patch
---

Fix a chunk generated under one seed being handed to a request for the same position under another seed. A pending chunk completion was shared by dimension and position alone; it is now shared only within the same seed and settings.
