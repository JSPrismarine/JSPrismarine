---
'@jsprismarine/prismarine': minor
'@jsprismarine/bedrock-data': patch
---

A change of world and the respawn exchange go through the session's presenter. `SessionPresenter` gains `showWorldChange`, which returns the loading screen the session waits on, `showRespawnPoint`, and `placesItselfOnRespawn`. `ShownDimension` carries the dimension's `bedrockId`. `PlayerSession.sendRespawn` is removed: call `session.presenter.showRespawnPoint` instead.

A Bedrock dimension change now sends what each protocol's pinned Bedrock Dedicated Server sends in its `change-dimension` exchange: `ChangeDimension` and the server's `ChangeDimensionAck`, with no `StopSound` and no `PlayStatus(PlayerSpawn)`. The `change-dimension` captures at protocols 2193, 2225 and 2259 now record the `StopSound` and `PlayerAction` packets as well.
