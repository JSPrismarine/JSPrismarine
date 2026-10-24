---
'@jsprismarine/prismarine': patch
---

Fix a 1.26.51 client with a character-creator skin being unable to join: a persona tint's piece type now travels as the lower-case `persona::PieceType` member name (`facialhair`, `high_pants`), not the client data's `facial_hair`. A client given the old spelling treated `PlayerListPacket` as malformed and closed the connection about a second after `StartGame`, with no `Disconnect` or `PacketViolationWarning`.
