---
'@jsprismarine/prismarine': minor
---

The `network/` subpaths of modules that moved out of `network/` are gone. Import each from where it lives now:

- `network/PlayerSession` from `player/PlayerSession`
- `network/ChunkSender` from `player/ChunkSender`
- `network/sessionPlayers` from `player/sessionPlayers`
- `network/presenter/SessionPresenter` from `player/presenter/SessionPresenter`
- `network/handler/HandlerContext` from `player/context/HandlerContext`
- `network/handler/ConnectionContext` from `player/context/ConnectionContext`
- `network/handler/SessionHandler` from `player/context/SessionHandler`
- `network/decoder/PacketDecoder` from `editions/bedrock/decoder/PacketDecoder`
- `network/decoder/DecodeView` from `editions/bedrock/decoder/DecodeView`
- `network/LoginIdentity` from `editions/bedrock/LoginIdentity`
