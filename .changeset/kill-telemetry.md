---
'@jsprismarine/prismarine': minor
---

With `xbox-achievements` on, a Bedrock client is told what a Bedrock Dedicated Server tells it with `LegacyTelemetryEvent`: when its player's blow kills a mob, when an entity kills its player, and when a command its player sent succeeds. These are the events a client cannot see for itself.

`SessionPresenter` gains `reportKill`, which a custom presenter has to implement.
