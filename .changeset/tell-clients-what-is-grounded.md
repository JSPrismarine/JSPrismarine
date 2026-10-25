---
'@jsprismarine/prismarine': patch
---

Tell a client which entities are standing on the ground.

`MoveActorAbsolutePacket` wrote a zero header for every entity, so its on-ground flag was never set
and a client fell back to its own guess for every mob on the server. The comment said the runtime
modelled no grounded state to read, which is no longer true: a mob is carried through the air only
while an impulse is still spending itself, and `EntityRuntime.coast` ends that by landing it on the
first cell it cannot fall into.

`Entity.isOnGround` is named apart from `Player.onGround`, which is the client's own report of the
same fact for the entity it controls and which also pays out the fall damage a landing earned.
Anything the server keeps no grounded state for reports false and is drawn from the client's guess,
which is what every entity got while the flag was never set at all. The predicate view now answers
`is_on_ground` for every entity rather than omitting it outside of players.
