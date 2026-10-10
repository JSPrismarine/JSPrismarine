---
'@jsprismarine/prismarine': minor
---

Give mobs their own vitals, and let them die.

Two gaps, and the second was the more visible: every mob shared the base attribute defaults, so a chicken and an iron golem both had twenty health and one point of attack; and `Entity.onDeath` was an empty hook that only `Player` overrode, so a mob whose health reached zero simply stood there for ever.

**`MobStats`** is a table of health, attack, knockback resistance and follow range keyed by entity identifier, and `Mob` builds its attributes from it. A table for the reason `EntitySize` is one: every mob shares a single class and differs only in what it is made of, so the alternative was an override in each of a hundred four-line files - a hundred places for a number to be wrong and nowhere to read the game's own figures against. A test asserts every class that extends `Mob` appears in it, which caught `minecraft:zombie_villager_v2` the first time it ran.

The health *maximum* moves with the value, not just the value: a golem given a hundred health with the ceiling left at twenty would have been clamped straight back down and been no tougher than a zombie.

Speed is deliberately not in the table. A mob's pace is `ai/Speed` and `Mob.walkSpeed`, which is what the server actually walks it at; `minecraft:movement` is only what the client is told. A second number here would let the two disagree, which is the failure `EntitySize` was written to end.

**Dying** now takes a second, because the client's death animation does. A mob that ran out of health used to be nothing at all; if it had been removed the moment its health hit zero it would have been deleted mid-roll and appeared to vanish. So it stops its goals, plays the animation and the sound, stands still for twenty ticks, drops what it was carrying and is then taken out of the world. The death bookkeeping runs before `update`'s loaded-chunk check, or a mob that died in a chunk that then unloaded would never reach the end of it.

**Loot** is rolled through the very same `DropTable` a block's drops go through - they are the same problem stated twice, and the table already existed, was already tested, and already takes its chance source as an argument so a roll can be made to repeat. Every item name in it is checked against `required_item_list.json`, which is the authority on what the client can be told about. The `doMobLoot` gamerule is honoured, which is the first time any of the gamerules that were registered and defaulted has actually been read.

**Sounds.** `WorldChangeSink` gained `actorSound`, separate from `blockSound` because the wire format differs in a way that matters: a mob's sound carries which mob is making it, so a client picks the zombie's grunt over the skeleton's rattle, where a block's carries the block's runtime id instead. Being hurt is now audible - the red flash is the client's own animation and makes no noise, so until now every hit landed silently.

**Death messages** learned who did it. They moved out of `Player` into `entity/DeathMessages.ts`, gained the attacker-aware keys, and keep vanilla's distinction between being slain by a person and by a mob. A mob killer with no nametag is named after its type rather than left blank.
