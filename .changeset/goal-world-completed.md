---
'@jsprismarine/prismarine': minor
---

Answer all 43 members of `GoalWorld`, which takes the vanilla goal inventory from 118 of 170 goals
able to run to all 170.

`goalWorldOf` implemented 22 of the seam's 43 members. A goal that reaches for a member the server
leaves out gets undefined and stops, so 52 of the 170 goals could never run against this host,
including `hurt_by_target` (42 of the 129 vanilla entities carry it), `panic` (37), `breed` (26),
`mount_pathing` (26) and `ranged_attack` (14). Riding, taming, breeding, item carrying and trade
interaction were all asleep for the same reason.

The 21 members added are `damagers`, `lastPusher`, `owner`, `vehicle`, `riders`, `poi`, `shoot`,
`push`, `mount`, `dismount`, `pickUp`, `giveItem`, `inventory`, `breakBlock`, `openTrade`,
`tradingPlayer`, `setSitting`, `setSleeping`, `explode`, `canBreedWith` and `breedWith`.
`goalWorldOf` returns `Required<GoalWorld>`, so a member added to the seam stops the build until
the runtime can answer it rather than quietly putting goals back to sleep.

**Points of interest.** `src/entity/data/poi.ts` is a new index with two sources. Java's `PoiTypes`
is a block-to-kind table, so a bed is a home, a bell is a village's meeting point and each of the
thirteen job-site blocks is a work site; `indoors` and `outdoors` are answered by looking for a
roof. The warden's `suspicious_location` and the dolphin's `buried_treasure` have no marker in the
world at all, so they come from `EntityRuntime.recordPointOfInterest` and are empty until the
vibration listener and the generator fill them. Every search widens a ring at a time and stops at
the first hit.

**Relationships.** `src/entity/data/riding.ts` keeps both directions of who rides whom in one
index, so the rider's `vehicle` and the vehicle's `riders` cannot disagree, and
`minecraft:rideable.seat_count` decides whether there is room. `src/entity/data/breeding.ts` reads
`minecraft:breedable` for the mate types, the baby type, the taming requirement and the cooldown;
being in love is a timer on the body, which `EntityRuntime.setInLove` sets and a type with
`love_filters` answers with a filter instead.

**Combat and physics.** `src/entity/data/damageLog.ts` totals the damage per source in the order
the sources arrived, which answers `hurt_by_target`'s most recent hit and the wither's largest
total from the same list. `MobBody` carries a velocity that `push` adds to, and the runtime spends
it with Java's gravity and drag until the entity lands.

**Filters.** The runtime now supplies the half of `FilterEntityView` that only it knows:
`is_sitting`, `is_sleeping`, `is_riding`, `on_ground`, `has_target`, the vehicle, owner and target
views, and the distance measures, plus the world's clock, weather and difficulty. A sit goal that
sets the flag and a goal that refuses to run while the entity is sitting now agree.

Breaking: `EntityScene` gained 14 members, `goalWorldOf` returns `Required<GoalWorld>`,
`EntityRuntime.items` takes a center and a radius, and `EntityHostFacts` gained the optional
`items` and `takeItem` an item subsystem supplies.
