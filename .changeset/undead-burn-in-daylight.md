---
'@jsprismarine/prismarine': minor
---

Set the undead alight in the morning.

Night ended and nothing happened to the things that came out in it, so a zombie that wandered into the open at dawn stood there all day. It is one of the loudest signals in the game that time is passing, and its absence made a world feel static however much else was moving.

**Which mobs burn is stated per species rather than guessed.** "Is it undead" and "does it burn" are different questions with different answers: a husk's entire reason to exist is that it is the zombie that survives the desert sun, and a wither skeleton comes from a dimension with no sky. Zombies, zombie villagers, drowned, skeletons, strays and phantoms burn; husks, wither skeletons, zombie pigmen and zoglins do not.

Water saves you - which is why a drowned is safe in its river and alight the moment it climbs out - and the head is what counts, since a zombie in a one-deep pool has its feet under water and its skull in the sun. A helmet would save you too in vanilla; there are no armour slots yet, so that is not modelled.

Burning shares its timer with standing in a fire, so a zombie that walks out of one into daylight goes on burning rather than starting afresh, and one that reaches shade keeps burning for the usual eight seconds. `firedamage` is honoured.

**The sky check is on an interval, not every tick.** Working out whether anything stands between a mob and the sky means walking the column above it, which is cheap once and not cheap for every zombie on the server twenty times a second. It only runs for species that can burn at all, so nothing pays for it that would not catch fire anyway.

**`world/DayCycle.ts`** now holds the clock. The spawner had its own private copy of the day length and the dusk and dawn ticks, and two things now care what time it is - monsters may only spawn at night, and the undead burn in the morning. Two copies of those numbers would let a zombie spawn into a world that was about to set it on fire. `BlockView.seesSky` likewise replaces the spawner's own private version, so everything a mob is told about the world above it comes through the same reader as everything else.
