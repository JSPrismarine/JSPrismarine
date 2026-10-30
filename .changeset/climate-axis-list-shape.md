---
"@jsprismarine/worldgen": patch
---

`parseClimateParameterPoint` accepts a climate axis written as a `[min, max]` list, the shape Mojang's data generator writes into `reports/biome_parameters`, beside the number and `{ min, max }` forms it already read.
