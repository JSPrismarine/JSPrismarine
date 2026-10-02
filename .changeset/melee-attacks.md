---
'@jsprismarine/prismarine': minor
---

Let players actually hit things.

Every attack a client has ever sent this server was decoded in full and then thrown away. `InventoryTransactionHandler` had a branch that logged `Unhandled inventory transaction type` and returned, and that branch was where melee arrives - not `InteractPacket`, which despite the name carries mounting, dismounting and opening a villager's trades. One missing case was the whole reason nothing could be killed.

**`entity/Combat.ts`** holds the swing: free functions rather than a method, because both sides of a fight need the same code and they live in different hierarchies - a `Player` is a `Human`, a zombie is a `Mob`, and their only common ancestor is `Entity`, which has no business knowing what a weapon is. It deliberately imports neither `Player` nor `Mob`: a goal will call this in the next change, goals are reached from `Mob`, and `Mob` would then import it back. Anything species-specific is passed in by whoever knows it, which is why the reach and the critical are options rather than being worked out here.

**Reach is measured to the body, not between two positions**, and that distinction is the whole difficulty. A player's position is their *eyes* and every other entity's is its *feet*, so a straight point-to-point distance compares two things that are not the same kind of thing - it is the same trap that once made a player able to shove a villager and nothing else. Measured to the box, a player standing on a cow and one standing beside it are both within reach. Survival gets three blocks and creative six.

**Weapon damage** is one table on `TieredTool`, not a method in each of thirty item files, and it can be one because a tiered tool already knows both things the answer depends on: the tier from there and the tool type from the item itself. The tier index is the *harvest* order, where gold sits between wood and stone - gold mines what stone mines but hits like wood, so the rows are not ascending runs and a table that assumed they were would have made golden swords wrong. Anything that is not a weapon does one point, which is vanilla's rule rather than a placeholder: a fist does one, and so does a torch.

**Criticals** need the player to be *descending*, not merely off the ground - `Player.getFallDistance` is now readable for exactly this, because a player rising through a jump is airborne too and vanilla does not let them crit on the way up. A critical is half again as much and throws stars around what was hit.

Sprinting is worth one knockback level, the same as one level of the enchantment, which is what makes a sprint-hit send somebody flying where a standing one nudges them. A swing that connects costs 0.1 exhaustion; a miss is free, which is why it is charged after the fact rather than before the attempt. Every swing makes a noise, including one that does nothing - the alternative is a swing that produces no sign at all and reads as the server having dropped the packet.

`SetActorMotionPacket` and the PvP gamerule both do something for the first time: knockback on a *player* has to be a request rather than a move, since their position is their own client's, and `canHarm` is the one place the rules about who may hit whom are stated.

Weapon durability is not decremented yet. It is left with the armour work, where the machinery for telling a client that a held item has changed lives - decrementing it here would drift the server's number away from the one the client is drawing, which is worse than not doing it.
