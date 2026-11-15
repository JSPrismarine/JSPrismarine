---
'@jsprismarine/protocol': patch
---

A decoded packet now gets its own empty list for a field its protocol version leaves off the wire. Every decode used to return the same array, so pushing into one payload's list changed the next one.
