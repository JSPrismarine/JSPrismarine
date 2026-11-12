---
"@jsprismarine/prismarine": patch
---

A mob loaded from a saved chunk keeps the portal cooldown it was saved with. Only an actor no loaded pack declares kept it, so a mob that was cooling down after a portal trip could take a portal again right after a reload.
