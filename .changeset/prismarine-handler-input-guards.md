---
'@jsprismarine/prismarine': patch
---

Packet handlers no longer act on client-supplied positions without checking them.
`PlayerActionHandler` refuses a block action further than a player can reach, which stopped a
client from breaking blocks it cannot see and from driving terrain generation anywhere on the
map one packet per chunk; it also refuses a creative break from a player who is not in
creative, and any block action from a spectator. `LevelSoundEventHandler` drops a sound
reported from somewhere the sender is not.

`EmoteHandler` relays within the sender's world to the clients that have the sender on screen,
and signs the emote with the server's record of the sender's XUID rather than the one the
client sent. `TextHandler` strips formatting codes and control characters from a chat message
and cuts it to 512 characters, so a message can no longer draw a line that looks like another
player said it.

`SetLocalPlayerAsInitializedHandler` drops a repeat notice, which used to re-announce the
player to everyone who can see it and resend its whole state, and reads the player's own
world rather than the default one.

`ServerSettingsRequestHandler` no longer answers with `UpdateAdventureSettingsPacket`, which
was unrelated to the request. `NetworkStackLatencyHandler` now echoes a ping that asks for an
answer, with the request flag cleared.
