---
'@jsprismarine/prismarine': patch
---

`BaseProvider` now declares the optional members of `Provider`, such as `supportsChunkUnload`, `readPlayerData` and the replay snapshot methods. `Level`, `World` and the test level helpers type their provider as `BaseProvider` instead of `BaseProvider & Provider`.
