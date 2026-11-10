---
'@jsprismarine/prismarine': patch
---

Three settings choose how clients reach the server, all on by default: `enable-raknet` accepts clients over RakNet, `enable-nethernet` accepts them over NetherNet, the WebRTC transport Bedrock Dedicated Server defaults to, and `enable-lan-visibility`, named as Bedrock Dedicated Server names it, shows the server to players on the local network. `Config` reads them through `getEnableRakNet()`, `getEnableNetherNet()` and `getEnableLanVisibility()`.
