---
'@jsprismarine/block-behaviors': patch
---

Leaf decay checks are cheaper. The search for a log near a leaf no longer builds a string key and a position for every block it visits, and it remembers which blocks are logs and leaves. In a profile of a player sprinting through forest it was the largest single cost in the random tick, and a full search now takes about an eighth of the time.
