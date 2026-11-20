---
'@jsprismarine/commands': patch
---

Take `true` or `false` for `/gamerule dofiretick` and `/gamerule doFireTick`, as Bedrock's `BoolGameRule` enum lists them. Java made the rule the integer `minecraft:fire_spread_radius_around_player`, so the command refused a boolean and a Bedrock player could not turn fire spread off.
