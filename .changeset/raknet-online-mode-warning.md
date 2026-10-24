---
'@jsprismarine/raknet': patch
---

`ServerSocket` no longer warns that online mode is unsupported when constructed with `onlineMode` set. RakNet has no part in Bedrock's online mode: the client never enables RakNet security, and the identity check belongs to the game layer's login. The parameter is kept so existing calls still compile.
