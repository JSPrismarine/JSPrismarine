---
'@jsprismarine/prismarine': patch
---

Open a chest's lid while anybody has the chest open, and close it when the last player closes it or leaves. Like Java's `blockEvent(pos, 1, count)`, the server sends players near the chest the number of players with it open, for both halves of a double chest, every kind of chest and shulker boxes. The lid never moved before.
