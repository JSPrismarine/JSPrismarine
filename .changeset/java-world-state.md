---
'@jsprismarine/prismarine': minor
---

A Java Edition player sees the time of day, rain and thunder, the difficulty, the world spawn its compass points to and the tick rate `/tick` sets, and its client drops the chunks that leave its view. A Java join sends these before the chunks, as vanilla's does.

The session presenter's `sendTime` takes the level's time of day, game time and whether the day advances, and the presenter gains `showWeather`, `showDifficulty`, `showWorldSpawn`, `showTicking` and `showTickStep`. The weather, `/difficulty`, `/setworldspawn`, `/tick` and a level transfer go through these instead of sending Bedrock packets. A Bedrock client gets the same packets as before. `ChunkWire` gains `forget` and `radius`, and `ChunkView.need` returns the chunks it forgot. `WeatherWorld.broadcast` becomes `show`, which takes the weather before and after a change. `Level.isDayTimeAdvancing` says whether the time of day moves on.

Breaking: `sendTime` takes a `ShownTime` instead of a tick, and `SessionPresenter`, `ChunkWire` and `WeatherWorld` gain required members, so code outside this package that implements them has to add them.

The every-five-minutes time resend of a session sent its world's tick count as the time of day. It sends the level's time of day now.
