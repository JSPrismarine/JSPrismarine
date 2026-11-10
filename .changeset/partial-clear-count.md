---
"@jsprismarine/prismarine": patch
---

Show the right count after a partial `/clear`. Clearing part of a stack lowered only the slot's count and left the stack's own count, which the client is sent, at the old value until the inventory was sent again. Wearing a tool also writes a worn copy into the hand slot instead of changing the held stack in place.
