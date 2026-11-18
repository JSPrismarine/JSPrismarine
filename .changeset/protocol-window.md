---
'@jsprismarine/prismarine': minor
---

Accept older Bedrock releases through a window that counts back from the newest release the server supports. `protocol-window` in `config.json` is how many releases to accept, and defaults to 1, the newest only, as a Bedrock Dedicated Server does. A 1.26.51 client is now refused as outdated unless the window is 2 or more. `protocol-content` decides whether the world holds the newest release's content or only the oldest accepted release's. A preview is still negotiated with a client that announces it.

A session on an older release gets each block state as its release writes it: 1.26.60 gave fire, redstone wire and chorus plants connection states, which a 1.26.51 client is sent without, in chunks, block updates, item stacks, the creative menu, recipes, block sounds and block particles. A block its release does not have at all is sent as `minecraft:info_update`.
