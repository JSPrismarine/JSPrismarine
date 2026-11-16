---
'@jsprismarine/entity-goals': patch
---

Fix four goals against Java:

- `tempt` matched its items as the file writes them, so `wheat` never matched a held `minecraft:wheat` and most vanilla animals could not be tempted. Item names without a namespace now get `minecraft:`.
- `panic` with no `damage_sources` panicked at any damage, a fall included. It now uses Bedrock's documented default list, which leaves out falls as Java's `panic_causes` tag does.
- `avoid_mob_type` always ran at its sprint speed. It now walks at `walk_speed_multiplier` while the threat is 7 or more blocks away and sprints once it is closer, as Java's `AvoidEntityGoal` does. `Navigator.setSpeed` changes the speed of a walk under way.
- `stay_while_sitting` now holds the `jump` flag as well as `move`, as Java's `SitWhenOrderedToGoal` does.
