---
'@jsprismarine/prismarine': minor
---

Give skeletons bows, and arrows something to hit.

**`Projectile`** is not a mob with the thinking removed. It has no goals, no pathfinding and no business being shoved by its neighbours, and it needs one thing a mob does not: to notice what it passes *through* rather than only what it ends up inside. An arrow crossing three blocks in a tick steps clean over anybody standing between the two positions, so a check at the destination alone finds nothing at all. Hence the sweep - the flight is walked in quarter-block samples, entities before blocks, so somebody standing in a doorway is hit rather than the wall behind them.

The shooter is immune for the first few ticks, because an arrow starts inside the bow that fired it and nothing would ever leave the string otherwise. An arrow that cannot hurt what it meets - a creative player, something inside its grace period - carries on through rather than stopping dead in mid-air against them.

Arrows stick where they land and stay there, which needs the flight to stop entirely: ticking a stuck arrow would send it through the floor it just hit. Damage comes from *speed*, which is what makes drawing a bow fully worth doing - a skeleton's shot and a player's are the same arrow launched at different speeds. Snowballs and eggs hurt nothing and shove everything; that cannot go through `Entity.damage`, which refuses a blow of zero and would take the knockback with it.

**Drawing a bow is measured, not reported.** Bedrock says "started" in one transaction and "released" in another, and the gap between them is the charge - so `RELASE_ITEM`, which until now was logged and dropped, closes a clock that `CLICK_AIR` opens. The power curve is vanilla's rather than a straight fraction of the time, and the difference is the point: it is slow at first and fast at the end, so the last few ticks of a draw are worth far more than the first few, which is what makes half-drawing feel weak rather than merely weaker. A full draw crits.

Aiming uses Minecraft's own angle convention, where yaw runs clockwise from south - the x term is a negative sine and the z term a positive cosine. Getting that wrong sends every arrow off at ninety degrees to where the player was pointing, which looks like a physics bug rather than a sign error.

**Skeletons and strays got a brain of their own.** `rangedBrain` is the hostile one with the swing swapped for a bow, and unlike the melee goal the ranged one claims the *movement* lane - keeping its distance is half of how an archer fights. It outranks the approach, so a skeleton that has got within bow range stops closing and starts shooting, and backs off if you walk into it. That is what makes a bow dangerous rather than a worse sword.

**They visibly hold the bow, and visibly draw it**, and neither of those was possible before. `AddActorPacket` has no room for equipment, so a mob's weapon has to follow it as a packet of its own - without which a skeleton fires arrows out of an empty fist.

The pose took three goes to get right, and the first two were reasonable and wrong. Metadata could not reach a client at all for anything but the local player, so `entityMetadataChanged` had to exist first. Then the bow was being lowered for the single tick of each loose, which is worse than it sounds: a client that plays its release animation when the flag goes false shows *only* that - a twitch once a shot, and never a draw.

**The thing that actually poses the mob is `query.has_target`.** Mojang's own skeleton animation controller transitions into its attack state on `query.has_target && !query.facing_target_to_range_attack` and never looks at `is_using_item` at all, so what the client needed was not a flag but the *target's runtime id*, in the `TARGET_ENTITY_ID` metadata field. `Mob.setTarget` now publishes it - and clears it again when the mob gives up, or the skeleton would keep aiming at nothing. `USINGITEM` and `CHARGING` are still set, since the humanoid bow animations do read them.

@see https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/animation_controllers/skeleton.animation_controllers.json

Arrows are not taken out of the quiver and the bow is not worn down. Both need the same thing - telling a client that a slot has changed - and both are left with the armour work where that machinery lives, because a server that silently disagrees with the client about what is in a player's hand is worse than one that has not got round to the accounting.
