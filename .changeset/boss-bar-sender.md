---
'@jsprismarine/prismarine': patch
---

Add a server-side boss bar over `BossEventPacket`, which nothing sent before. A `BossBar` holds
one bar's actor, title, fill, color and overlay, replays that state to players as they
subscribe, fans updates out to subscribed players only, drops a player who disconnects, and can
move to another actor id when a bar has to follow a re-spawned boss or a stand-in actor. The
new `BossEventHandler` answers the client's serverbound `Query` by replaying the queried bar's
Add. Nothing on the server shows a bar yet; the End dragon fight will.
