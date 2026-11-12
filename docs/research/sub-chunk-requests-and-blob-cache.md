# Sub chunk requests and the client blob cache

Researched 2026-11-12. Scope: what a server must put in `SubChunkPacket` and `LevelChunkPacket` when a client has turned on its blob cache, read from Mojang's packet documentation and from servers and protocol libraries that game clients play on. It was prompted by a retail client (iOS, protocol 2225) leaving with `DisconnectFailReason` 90, `BadPacket`, each time right after a `SubChunkPacket`.

Sources and the revisions read:

- Mojang's packet documentation for 1.26.60, generated 2026-11-10: [SubChunkPacket](https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/sub-chunk-packet/), [LevelChunkPacket](https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/level-chunk-packet/), [ClientCacheStatusPacket](https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/client-cache-status-packet/), [ClientCacheBlobStatusPacket](https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/client-cache-blob-status-packet/), [ClientCacheMissResponsePacket](https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/client-cache-miss-response-packet/).
- [gophertunnel](https://github.com/Sandertv/gophertunnel) at `9e0ef1a`, which declares protocol 2225.
- [dragonfly](https://github.com/df-mc/dragonfly) at `0f9a3a57`, a server built on gophertunnel: `server/session/chunk.go` and `server/session/handler_sub_chunk_request.go`.
- [CloudburstMC/Protocol](https://github.com/CloudburstMC/Protocol) at `f2d5463d`: `SubChunkSerializer_v486`, `_v2168` and `_v2193`.
- [pmmp/BedrockProtocol](https://github.com/pmmp/BedrockProtocol) at `8eb5a390`: `src/SubChunkPacket.php` and `src/types/SubChunkPacketEntryCommon.php`.

Added the same day: a capture of Bedrock Dedicated Server (BDS) 1.26.60.6 answering that iOS client, described under [What Bedrock Dedicated Server sends](#what-bedrock-dedicated-server-sends). It confirms the reading of the sources and settles three points they left open.

## Summary

- A client says once, in `ClientCacheStatus`, whether it supports the cache. The server may then use it or not. (gophertunnel.)
- With the cache on, terrain never travels inside `SubChunkPacket`. An entry names the terrain by a 64-bit hash, the client answers `ClientCacheBlobStatus` with the hashes it lacks and the ones it holds, and the server sends the missing bytes in `ClientCacheMissResponse`. (gophertunnel, dragonfly.)
- A successful entry still has a payload when the cache is on. It holds the section's block entities and is empty when there are none. Only an all-air section has no payload. (Mojang, dragonfly, the pre-optional wire layout.)
- An all-air section queues no blob, so it has no hash. (Mojang, dragonfly.)
- The blob of a section is its terrain alone. The block entities are not part of what is hashed. (dragonfly.)
- This repository sent two shapes none of the sources send: the whole section inline beside its hash, and the hash with no payload once the client had confirmed it. The second is the shape the retail client left on.
- BDS answers every `ClientCacheBlobStatus` with a `ClientCacheMissResponse`, an empty one when nothing was missed, and announces a request-mode chunk through the cache as well. (Capture.)

## The wire layout

`SubChunkPacket`, id 174, at 1.26.60 (Mojang):

| Field | Type | Mojang's description |
| --- | --- | --- |
| Cache Enabled | bool | Whether client supports blob caching. |
| Dimension Type | varint32 | |
| Center Pos | 3 × int32 | |
| SubChunk Data | array | One entry per requested section. |

Each entry:

| Field | Type | Mojang's description |
| --- | --- | --- |
| SubChunk Pos Offset | 3 × int8 | Relative to the center. |
| SubChunk Request Result | uint8 | 1 Success, 2 LevelChunkDoesntExist, 3 WrongDimension, 4 PlayerDoesntExist, 5 IndexOutOfBounds, 6 SuccessAllAir. |
| Serialized Sub Chunk | optional string | "Serialized subchunk binary data, absent when cache enabled and result is SuccessAllAir." |
| Height Map Type, Subchunk Height Map | uint8, optional | "present when type is HasData." |
| Render Height Map Type, Subchunk Render Height Map | uint8, optional | Types 0 to 3 as above, and 4 AllCopied. |
| Blob Id | optional uint64 | "Blob cache ID, present when the subchunk data was queued in the cache transfer builder." |

gophertunnel's `protocol.SubChunkEntry.Marshal` and Cloudburst's `SubChunkSerializer_v2168` write the same fields in the same order, each optional as a presence byte followed by the value. The request result values moved up by one at this layout; before it, Success was 0.

## What the older layout shows

Until protocol 818 the entry had no presence bytes, so the rule for each field was in the serializer. Cloudburst's `SubChunkSerializer_v486`:

```java
if (subChunk.getResult() != SubChunkRequestResult.SUCCESS_ALL_AIR || !packet.isCacheEnabled()) {
    helper.writeByteBuf(buffer, subChunk.getData());
}
...
if (packet.isCacheEnabled()) {
    buffer.writeLongLE(subChunk.getBlobId());
}
```

pmmp/BedrockProtocol's `SubChunkPacketEntryCommon::write` has the same condition on the payload, and `SubChunkPacketEntryWithCache` writes a hash after every entry of a cached packet.

So in that layout the payload was on the wire for every entry except an all-air one in a cached packet, and a cached packet carried a hash for every entry. Mojang's description of the optional payload at 1.26.60 repeats the first rule word for word. The client code that reads the entry was written against that rule, which is the reason to expect it to read a successful entry's payload whether or not the cache is on.

## What a working server sends

dragonfly's `subChunkEntry`, for a section that has blocks:

```go
entry := protocol.SubChunkEntry{
    Result:     protocol.SubChunkResultSuccess,
    RawPayload: protocol.Option(append(serialisedSubChunk, blockEntityBuf.Bytes()...)),
    ...
}
if s.conn.ClientCacheEnabled() {
    if hash := xxhash.Sum64(serialisedSubChunk); s.trackBlob(hash, serialisedSubChunk) {
        transaction[hash] = struct{}{}

        entry.BlobHash = protocol.Option(hash)
        entry.RawPayload = protocol.Option(blockEntityBuf.Bytes())
    }
}
```

| Case | Result | Payload | Hash |
| --- | --- | --- | --- |
| Cache off, section has blocks | Success | Terrain followed by the section's block entities | Absent |
| Cache on, section has blocks | Success | The section's block entities, an empty byte string when it has none | xxHash64 of the terrain |
| Section is all air, cache on or off | SuccessAllAir | Absent | Absent |
| Chunk not loaded, index out of range | ChunkNotFound, IndexOutOfBounds | Absent | Absent |

Three details in it:

- The hash covers the terrain only. The block entities stay in the packet.
- The terrain is never inline when a hash is sent. A client that lacks the blob gets it from `ClientCacheMissResponse`.
- dragonfly sends the same answer whether or not the client has already confirmed the blob. It keeps no per-client record of which blobs the client holds for this purpose.

dragonfly leaves the payload out of an all-air entry with the cache off as well. Mojang's description and the older layout put it on the wire in that case. This repository keeps it, as the documentation says.

For the chunk itself, in request mode, dragonfly sends a `LevelChunkPacket` with `SubChunkCount` 0, the optional sub chunk limit set to the highest filled section, and then one of two forms:

| Client cache | Cache Enabled | Blob hashes | Payload |
| --- | --- | --- | --- |
| On | true | One, the biomes | One zero byte, the border block count |
| Off | false | None | The biomes followed by one zero byte |

## The cache exchange

- `ClientCacheStatus` (client to server, once): whether the client supports the cache. "If true, it may do so, but it may also choose not to use it." (gophertunnel.) Some clients never turn it on.
- `ClientCacheBlobStatus` (client to server): `MissHashes`, which the server "should send the blobs matching these hashes as soon as possible", and `HitHashes`, which it can stop holding. (gophertunnel.)
- `ClientCacheMissResponse` (server to client): the bytes of each missed blob with its hash. Mojang describes a blob as "Subchunk data ... plus biome data".
- dragonfly records the hashes of each packet as a transaction and stops tracking once 4096 blobs wait unacknowledged, at which point it logs an error and sends the terrain inline without a hash.

## What Bedrock Dedicated Server sends

Captured 2026-11-12: BDS 1.26.60.6 for Linux in a container (`level-type=FLAT`, `online-mode=false`, `server-udp-ports=127.0.0.1:19140:19140`), an iOS client at protocol 2225 joining through `packages/client/tools/nethernet-proxy.mts`, which records every message both ways. The player stood still, walked about ten chunks out and back, died, respawned and left. 5381 packets in 75 seconds. (Run.)

Every one of the 145 `SubChunkPacket`s had Cache Enabled true. Their 3592 entries had two shapes:

| Entries | Result | Payload | Height map | Render height map | Hash |
| --- | --- | --- | --- | --- | --- |
| 2803 | 6 SuccessAllAir | Absent | 3 AllTooLow, no data | 3 AllTooLow, no data | Absent |
| 789 | 1 Success | Present, zero bytes | 1 HasData, with data | 4 AllCopied, no data | Present |

- The payload of a successful entry is present and empty: the flat world has no block entities. No entry carried terrain.
- An all-air entry has neither payload nor hash, as dragonfly sends it.
- The render height map is AllCopied only beside a height map that has data. Beside AllTooLow it repeats AllTooLow.
- The answers after the walk back and after the respawn, for sections the client had confirmed before, have the same two shapes.

All 783 `LevelChunkPacket`s had the same form, here for chunk 0, 0:

```
3a 00 00 00 00 01 02 01 01 93 df f8 d4 76 b3 c4 7a 01 00 00
```

Sub chunk count 0, the request limit present and 1, Cache Enabled true, one blob hash, a payload of one zero byte, and no biome update. That is dragonfly's cached form: the biomes are a blob.

The cache exchange: 105 `ClientCacheBlobStatus` from the client and 105 `ClientCacheMissResponse` from the server. BDS answers each status, with a response of no blobs (3 bytes) when the client missed nothing.

Around the death and respawn BDS sent, in order: `Respawn`, `NetworkChunkPublisherUpdate`, `SetActorData`, `UpdateAttributes` at the death; two `Respawn` after the client's own; then `ActorEvent`, `SetHealth`, `UpdateAttributes` and `SetActorData` after the client's `PlayerAction`; then the chunks around the spawn point as above.

One more thing the capture needed: BDS 1.26.60 refuses a login (`NotAuthenticated`, 46) on a connection whose offer was not signed with the login's identity key, with `online-mode=false` as well. The proxy therefore logs in with a key of its own.

## What this repository sends

`PlayerSession.handleSubChunkRequest`, before the change made alongside this note:

| Case | Payload | Hash | Matches the sources |
| --- | --- | --- | --- |
| Cache on, blob not yet confirmed | The whole section: terrain and block entities | Hash of terrain and block entities | No: terrain inline beside its hash, and block entities inside the blob |
| Cache on, blob confirmed by the client | Absent | Same hash | No: a successful entry without a payload |
| Cache on, all air | Absent | Hash of the two all-air bytes | No: an all-air section queues no blob |
| Cache off | The whole section | Absent | Yes |

On 2026-11-12 an iOS client joined three times and left with error 90 each time. The last packet the server sent before each disconnect was a `SubChunkPacket`, answered after the client had confirmed blobs: twice after a respawn and once after walking into new chunks. The join itself, where no blob was confirmed yet, never failed.

After the change, a cached successful entry is the hash of the terrain plus the block entity payload, an all-air entry in a cached packet has neither, and the terrain goes out only in `ClientCacheMissResponse`. In the one session run since, the client was answered 64 sub chunk requests while walking without leaving. It still left with error 90 after a respawn.

Three more differences from the capture, changed after it:

| What | This repository sent | BDS sends |
| --- | --- | --- |
| Answer to a `ClientCacheBlobStatus` that misses nothing | Nothing | An empty `ClientCacheMissResponse` |
| Request-mode `LevelChunkPacket` to a client with the cache on | Cache Enabled false, biomes inline | Cache Enabled true, the biomes as a blob, a one-byte payload |
| Render height map type beside AllTooLow | AllCopied | AllTooLow |

Whether these three end the respawn disconnect was not yet tested with the retail client when this was written.

## Not checked

- A world with terrain above a section. The capture is of a flat world, so it has no successful entry whose height map is AllTooHigh, no failed entry, and no block entities. This repository repeats AllTooHigh for the render height map by the same reading as AllTooLow, unverified.
- Whether the retail client's respawn disconnect is one of the three differences above.
- cinnabar's reading of the same entries. Its NetherNet build turns the cache on, and the client e2e suite stalls on chunk delivery after a far teleport with it.

## Reproduction

- Mojang's pages: fetch the URLs above; the field tables are in the page text.
- gophertunnel: `minecraft/protocol/sub_chunk.go`, `minecraft/protocol/packet/level_chunk.go`, `client_cache_status.go`, `client_cache_blob_status.go` and `client_cache_miss_response.go`.
- dragonfly: `server/session/chunk.go`, functions `ViewSubChunks`, `subChunkEntry`, `sendBlobHashes`, `sendNetworkChunk` and `trackBlob`.
- Cloudburst: `bedrock-codec/src/main/java/org/cloudburstmc/protocol/bedrock/codec/v486/serializer/SubChunkSerializer_v486.java`, and the `v2168` and `v2193` serializers beside it.
- pmmp: `src/types/SubChunkPacketEntryCommon.php` and `src/types/SubChunkPacketEntryWithCache.php`.
- The retail sessions: a server from this branch with `log-level` `silly`, joined from an iOS client on the same network; the packet names before each disconnect are in its log.
- The BDS capture: unpack the pinned `bedrock-server-1.26.60.6.zip`, set the properties named above, and run it in an `ubuntu:24.04` container for `linux/amd64` with `libcurl4`, TCP 19134 and UDP 19140 published. Run `node --import tsx packages/client/tools/nethernet-proxy.mts --upstream 127.0.0.1:19134 --out <dir>`, join the proxy's port from the game client, and split the result with `node --import tsx packages/client/tools/decode-capture.mts <dir>/connection-1.jsonl`. The packets land beside it with an `index.tsv`.
