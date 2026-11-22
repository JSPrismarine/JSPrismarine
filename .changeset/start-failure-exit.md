---
'@jsprismarine/server': patch
---

A server that cannot start, such as one whose NetherNet library fails its checksum, logs the reason once and exits with code 1, without Node's unhandled promise rejection warning and a second copy of the error.
