---
'@jsprismarine/prismarine': patch
---

Run the ban, permission, recipe, station, chat, and query managers as modules
on the `@jsprismarine/kernel` module kernel inside `Server`. The public
`getXxxManager()` getters are unchanged and now resolve their service tokens
from the kernel.
