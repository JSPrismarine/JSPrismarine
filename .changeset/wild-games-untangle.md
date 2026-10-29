---
'@jsprismarine/prismarine': patch
---

Move the `GameRule` wire structure and its codecs to `network/type/GameRule`, and import `ActorEvent` from `@jsprismarine/minecraft` in entity and world code. `GameRulesChangedPacket` and `ActorEventPacket` keep deprecated re-exports, so existing imports still work.
