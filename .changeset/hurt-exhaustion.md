---
'@jsprismarine/prismarine': patch
---

Charge a player the food exhaustion of a blow's Java damage type when the blow takes health, as Java's `Player.actuallyHurt` does: 0.1 for most blows and nothing for a fall, drowning, magic or starving. The new `foodExhaustionOf` in `entity/damageTypes` reads it.
