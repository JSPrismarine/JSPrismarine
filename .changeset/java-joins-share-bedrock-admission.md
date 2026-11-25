---
'@jsprismarine/prismarine': minor
---

Java Edition players now join through the same steps as Bedrock players. The ban list, the allow list and `max-players` turn them away, with vanilla's own message for each. The `playerSpawn` event fires for them, and everyone sees "joined the game" when they join and "left the game" when they leave. The console logs one line for a join on either edition, naming the transport the player came in over, in place of the two lines each edition logged differently.

Cancelling `playerSpawn` now disconnects the joining player, on either edition, with "You were not let into the world." Before, a cancelled Bedrock join left the client on the loading screen.

Breaking: `JoinPreparation.prepare` takes the `PlayerIdentity` the player plays as, with any account link already resolved, and optional `JoinOptions`, in place of a Bedrock `LoginIdentity`. A caller resolves the account with `AccountLinks.resolve` and sets a skin or a device through `JoinOptions.dress`.
