---
'@jsprismarine/prismarine': minor
---

Make the world dangerous to everything in it, not just to players.

Falling, drowning and burning were all implemented, and all of them applied to exactly one kind of entity. A player drowned; a zombie stood in lava indefinitely, at full health, for as long as the chunk stayed loaded.

**`entity/Environment.ts`** holds the rules and nothing else - which blocks break a fall, how far is free, how often a burn hurts. Deliberately constants and small functions rather than a base class, because the two things that need them could hardly be less alike: a player's fall is *reported* by their own client and has to be added up from position packets, while a mob's is simulated here and falls straight out of its velocity. Only the rules are shared; the bookkeeping cannot be.

**`BlockView` learned what a hazard actually does.** It already knew which blocks a mob would rather walk round, as a flat set - enough for the pathfinder, which only asks "would this hurt". The damage code needs to know *how*: burning to death and being pricked by a cactus are different deaths, and armour helps with one and not the other. The set became a map to a `DamageCause`, and the same lookup now also answers which blocks break a fall, so the whole of what a mob needs to know about where it is standing comes through the one synchronous reader the pathfinder already uses. Awaiting a chunk load per mob per tick would cost more than the mobs do.

Mobs now take fall damage, burn in fire and lava and keep burning for eight seconds after getting out, are pricked by cacti, suffocate inside blocks, drown, and die in the void. The burn outlasting the fire is what makes walking *through* one worse than walking past it, and what makes water worth running to.

**Which things breathe water is stated, not inferred.** The obvious proxy - a swim speed above a walk speed - reads correctly in vanilla and not here, because every mob currently gets the same movement attributes; it would have answered "no" for every fish in the game and drowned the lot of them. `MobStats` carries an `aquatic` flag instead. Dolphins and turtles are deliberately not aquatic: they breathe air, and in vanilla they drown.

**The gamerules do something.** `falldamage`, `firedamage`, `drowningdamage` and `naturalregeneration` have been registered and defaulted since long before anything read one of them; they are now honoured, for players as well as mobs. `GameRules.DrowingDamage` is spelt correctly at last - the *value* was always right, so the rule worked, but the constant's name was missing an `n` and anything reaching for the correctly-spelt one silently looked up a gamerule called "undefined".

The player's own duplicated copies of the fall and water tables are gone; there is one of each now, and both kinds of entity read the same one.
