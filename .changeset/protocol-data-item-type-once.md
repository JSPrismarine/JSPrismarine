---
'@jsprismarine/protocol': patch
---

`DataItem` writes and reads the `Type` byte once. The one-of in the 1.26.51 docs has no separate selector ahead of the variant's own `Type`, so the earlier varuint selector put an extra byte between every id and its value. Reading no longer requires a selector to agree with the type byte.
