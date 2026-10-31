---
"@jsprismarine/commands": patch
---

Give `/locate` Java's three forms, `structure`, `biome` and `poi`, each taking an id or a `#tag`, and answer the way Java's `LocateCommand` does: `The nearest <name> is at [x, ~, z] (N blocks away)` for a structure, a real height and a three-axis distance for a biome, Java's not-found lines, and the distance as the command result. The name argument suggests Mojang's list plus every id and tag the host's generator knows through the new `WorldCommandHost.locateNames`.
