---
'@jsprismarine/prismarine': minor
---

Accept older Bedrock releases through a window that counts back from the newest release the server supports. `protocol-window` in `config.json` is how many releases to accept, and defaults to 1, the newest only, as a Bedrock Dedicated Server does. A 1.26.51 client is now refused as outdated unless the window is 2 or more. `protocol-content` decides whether the world holds the newest release's content or only the oldest accepted release's. A preview is still negotiated with a client that announces it.
