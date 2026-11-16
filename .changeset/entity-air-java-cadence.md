---
'@jsprismarine/entities': patch
---

Run Java's air rules in `minecraft:breathable`. An entity out of air is hurt every 20 ticks instead of every 10, a land breather regains 4 air a tick instead of refilling at once, a water breather back in water refills at once, and lava no longer spends air unless the body sets `breathes_lava` to false.
