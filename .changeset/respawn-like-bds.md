---
'@jsprismarine/prismarine': patch
---

Fix respawning: pressing Respawn after a death left the client frozen, unable to move or act. The server now runs the respawn exchange as a Bedrock Dedicated Server 1.26.52 does. It answers the client's `ClientReadyToSpawn` with `SearchingForSpawn` at the spawn block and then `ReadyToSpawn` at eye height, with nothing after them. On the respawn action it sends `ActorEvent(SPAWN_ALIVE)`, the health, the attributes and the actor data, without moving the client. Every `Respawn` now names runtime id 0.
