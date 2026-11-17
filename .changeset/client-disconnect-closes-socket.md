---
'@jsprismarine/client': patch
---

`Client.disconnect()` closes the transport even after the server has ended the connection. It used to return early, which left the RakNet socket bound and its ticker running until the process exited.
