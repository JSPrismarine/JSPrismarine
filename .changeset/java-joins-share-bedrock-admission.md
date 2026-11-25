---
'@jsprismarine/prismarine': patch
---

Java Edition players now join through the same steps as Bedrock players. The ban list, the allow list and `max-players` turn them away, with vanilla's own message for each. The `playerSpawn` event fires for them, and everyone sees "joined the game" when they join and "left the game" when they leave. The console logs one line for a join on either edition, naming the transport the player came in over, in place of the two lines each edition logged differently.
