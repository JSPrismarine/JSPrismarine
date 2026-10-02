---
'@jsprismarine/prismarine': minor
---

Teach mobs to fight, and let them fight each other.

A zombie already walked up to you and then stood there. The pursuit was all there; what was missing was a target it could act on and anything that swung.

**A target belongs to the mob, not to a goal.** Several goals need the same answer - one picks somebody, another walks to them, a third hits them - and a target private to whichever goal found it would have to be rediscovered by each of the others, which is how they drift apart the moment one changes its mind. The mob also does the forgetting: a target that dies, leaves the world, or spends five seconds out of range is dropped once, centrally, rather than by each goal separately. That forgetting runs before the loaded-chunk check, because a mob holding a reference to a corpse until somebody walks back into the area is both a leak and a fight it would resume with a dead thing.

**Four new goals, and the interesting thing is that three of them claim no lanes.** Vanilla has a separate "target selector" running beside its goal selector; here that falls out of the lane system already present - a goal with no lanes blocks nothing and is blocked by nothing, so choosing who to fight runs alongside whatever is currently walking the mob, which is exactly right because deciding is not something that competes with moving.

- `NearestAttackableTargetGoal` finds somebody, filtered. It reads the entity grid rather than the whole world, and stands down while the mob already has a target - re-picking every tick makes a mob swap between two equidistant players and reach neither.
- `HurtByTargetGoal` turns on whoever hit it. **This is the whole of mob-versus-mob, and nothing in it knows that mobs can fight each other**: a skeleton's stray arrow hits a zombie, the zombie asks who hurt it, and every goal downstream carries on as it would against a player. It has to remember which blow it has already answered, because `getLastDamageSource` keeps its answer indefinitely and the mob could otherwise never be distracted again.
- `MeleeAttackGoal` swings, on a one-second cooldown, and sends the arm-swing event - vanilla calls it `StartAttacking` - so the target is not hurt by something that visibly never moved.
- `PanicGoal` is what an animal does instead of fighting back. Before it, being hit did nothing at all and a herd stood placidly while it was slaughtered.

**`ApproachPlayerGoal` became `ApproachTargetGoal`** and stopped hunting for its own target. That one change is what lets a zombie chasing a person and a golem chasing a zombie share every line of pursuit code; the three fighting brains now differ from each other in exactly one argument - which filter they hand the targeting goal. A fourth, `neutralBrain`, is the hostile one with that goal simply left out, so a wild wolf wanders until somebody hits it.

An iron golem is a guardian rather than a villager now, and hunts the monsters a village needs driving off - not creepers, for vanilla's reason: a golem that charged one would set it off inside the village it is guarding.

**Difficulty exists.** `StartGamePacket` wrote a hardcoded zero, which is *peaceful*, so however a server was configured every client was told monsters could not hurt anybody. It is now a config option named in words rather than numbered, it reaches the client, mob damage is scaled by Mojang's documented multipliers - a zombie's three becomes two on easy and five on hard - and peaceful stops monsters spawning at all rather than spawning harmless ones that would still crowd the caps.

Only mob attacks scale. A player's sword does what the sword says whatever the world is set to, and so does falling and drowning: the setting is about how dangerous the monsters are, not how dangerous the world is.
