---
'@jsprismarine/prismarine': minor
'@jsprismarine/entity-goals': patch
---

Run live entities through the data-driven runtime. `EntityRuntime` was built only by its own
tests, so the whole `src/entity/data/` layer, and with it `@jsprismarine/entities`,
`entity-goals`, `entity-brains`, `spawning` and `trading`, never ran on a server. A server with
`content-packs` on now opens one runtime per dimension as that dimension's content adapter is
assembled, supplies its host from the live world, and ticks it from `World.update`.

What this turns on, with the flag on: the 60 Bedrock spawn rules and the six-step spawn cycle in
`@jsprismarine/spawning`, over Bedrock's caps and cadences rather than Java's; the population
despawn pass; the 170 goals and the 20 brain mobs over the real world; `minecraft:breedable`;
villager trade tables through `Merchant`; and Java's loot tables on death. `MobSpawner` and the
written entity classes still run with the flag off, which is the default.

Each data entity carries a `GenericEntity` body so clients see it, and the two stay in step:
position and health go out to the body, and damage the legacy pipeline dealt to the body comes
back carrying whoever dealt it. `GenericEntity` rather than one of the written classes, so
nothing runs the legacy goals against the same body.

`ServerWorldSourceOptions` gained `entityRuntimes`, which is what fills the adapter's `spawning`
and `ai` groups; without it both stay absent and every projected member still names the subsystem
that owes it. `Server.getEntityRuntime` and `World.dataEntities` read one back.

`GoalWorld.mobs` now includes players, carrying the `player` and `mob` families a filter can ask
about. 49 vanilla entities carry `nearest_attackable_target` with an `is_family: player` entry and
that goal searches `mobs`, so without this no monster ever found anybody.

Two measured costs on the way: `Navigator.randomTarget` asked the path finder about ten candidate
destinations and a candidate inside a block fails only after the search spends its whole 512-node
budget, and the path finder's view of the blocks was rebuilt per query and resolved every read
through the palette. Together these were 623 microseconds per entity per tick; they are now 20.
