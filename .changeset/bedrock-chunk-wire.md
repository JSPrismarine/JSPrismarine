---
'@jsprismarine/prismarine': minor
'@jsprismarine/errors': patch
---

A Bedrock client's chunks go out through a `ChunkWire`, as a Java client's do, so the session sends both editions' chunks the same way. `BedrockChunkWire` sends the publisher updates, the `LevelChunk`s, the radius, and the sub chunks and cache blobs the client asks for.

`SessionPresenter.chunkWire` is required. `ChunkWire` gains `prepare`, which serializes a chunk as it is queued; `center` takes the view, with the player's block and the distance; and `send` reports each chunk through a `ChunkSendProgress`. `PlayerSession.sendNetworkChunkPublisher` is now `publishChunkView(distance)`. `PlayerSession.setClientCacheEnabled`, `getClientCacheEnabled`, `handleClientCacheBlobStatus` and `handleSubChunkRequest` are removed: a Bedrock handler reaches them through `bedrockChunksOf(session)`, as `setClientCacheEnabled`, `answerBlobStatus` and `answerSubChunkRequest`.

`PrismarineNetworkErrors.PresenterHasNoSession` names any session state a presenter lacks, and `NotABedrockSession` is new.
