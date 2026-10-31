---
"@jsprismarine/prismarine": patch
---

Wind the portal cooldown back on every tick an entity stands in a portal, as Java's `Entity.setAsInsidePortal` does, and hold a player's cooldown while their client is still loading into the last dimension change. A traveler who arrives inside the destination portal is no longer sent straight back; the trip back needs leaving the portal for the whole cooldown and stepping back in.
