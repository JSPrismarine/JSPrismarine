---
'@jsprismarine/prismarine': patch
---

Every `ChangeDimensionPacket` the server sends now carries a `Loading Screen Id`, handed out by the new `PlayerSession.beginLoadingScreen()`, and `ServerboundLoadingScreenHandler` checks a closed screen off with `PlayerSession.endLoadingScreen(id)`. `ChangeDimensionPacket.dimension` is typed as the `Dimension` enum from `@jsprismarine/minecraft`; plain numbers still assign to it.
