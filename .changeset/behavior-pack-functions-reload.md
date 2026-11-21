---
'@jsprismarine/prismarine': patch
---

The server runs the `.mcfunction` files in the `functions` folder of the world's behavior packs, named by their path there, and the functions each pack's `functions/tick.json` lists every tick. `/reload` reads them again, so an edited function runs as edited without a restart, as on Bedrock Dedicated Server. Closes #3225.
