---
'@jsprismarine/native-network': patch
---

The native networking library stays loaded for the life of the process, so a worker thread that loaded it can exit while libdatachannel's threads keep running, where the process used to crash on exit.
