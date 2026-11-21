---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

A Java Edition player can break blocks: a creative player breaks them at once, and a survival player's break is timed by the server and checked as a Bedrock player's is. Bedrock's mining actions and Java's `Player Action` now decode into one `mineBlock` intent, which plugins can append handlers to, and `HandlerServices` gains `intents`. `@jsprismarine/protocol` gains Java's `Player Action` and `Acknowledge Block Change` packets.
