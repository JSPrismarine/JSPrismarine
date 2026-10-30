---
'@jsprismarine/prismarine': patch
---

Track portal contact and the cooldown after a dimension change on every entity, and persist
the cooldown. `PortalContact` is Java's `PortalProcessor`: the time inside a portal climbs by
one per tick the entity touches it and drops by four per tick outside, and the trip fires when
it reaches 80 ticks for a player, 0 in creative and 0 for anything else. `Entity` gains
`touchPortal`, `portalContact`, `getPortalCooldown`, `setPortalCooldown` (300 ticks for an
entity, 10 for a player) and `isOnPortalCooldown`, with the countdown in `Entity.update`.

Actor NBT now carries Bedrock's `PortalCooldown` and `DimensionId` tags, and a player record
carries `PortalCooldown` beside its other Bedrock fields and `portalCooldown` in
`WorldPlayerData`. Nothing dispatches a trip yet; the timers are in place for portal travel to
read.
