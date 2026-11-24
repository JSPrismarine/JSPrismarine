---
'@jsprismarine/script-host': patch
---

The load-time Script API coverage line counts a name only as a member of a class the pack's scripts can reach from what they import, so a name used on another API, such as `@jsprismarine/server`'s `levels`, is no longer reported as an unimplemented member.
