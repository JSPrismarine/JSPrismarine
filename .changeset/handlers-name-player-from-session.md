---
"@jsprismarine/prismarine": patch
---

Forty-two packet handlers take the sender's name and runtime id from its `PlayerSession` (`identity.name`, `identity.xuid` and `runtimeId`) instead of from the `Player` object, so they no longer look the player up to write a log line or compare an id. `blockTargetRejection` takes a `BlockTargetSender`, anything with a position and a world, instead of a `Player`; a `Player` still satisfies it.
