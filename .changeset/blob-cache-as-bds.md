---
'@jsprismarine/prismarine': patch
---

The blob cache exchange follows a capture of Bedrock Dedicated Server 1.26.60 answering a retail client. Every `ClientCacheBlobStatus` is answered with a `ClientCacheMissResponse`, an empty one when the client missed nothing. A request-mode `LevelChunkPacket` to a client with the cache on names its biomes by hash and carries only the border block count. A sub chunk's render height map repeats the height map's type when there is no data to copy, and is `AllCopied` only beside one that has data.
