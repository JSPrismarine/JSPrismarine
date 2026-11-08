---
'@jsprismarine/prismarine': patch
---

Log a sub chunk request for a column the server never queued at debug instead of as one warning per sub chunk. A client that moved or changed dimension asks for columns of its old view, and the answer is unchanged.
