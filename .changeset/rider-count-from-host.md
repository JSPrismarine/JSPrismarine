---
'@jsprismarine/entities': patch
---

The `rider_count` filter test counts the riders a host seats on an entity itself, as the server's runtime does, where it read 0 whenever the instance's own seats were empty.
