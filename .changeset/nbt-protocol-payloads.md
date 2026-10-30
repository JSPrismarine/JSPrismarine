---
'@jsprismarine/nbt': patch
'@jsprismarine/protocol': minor
'@jsprismarine/prismarine': patch
---

Four fixes the `@jsprismarine/protocol` payload builders found by comparing generated payloads against
a captured Bedrock Dedicated Server 1.26.51.1 session.

`@jsprismarine/nbt` now types an empty list `TAG_End`, which is what a Bedrock Dedicated Server
writes, instead of `TAG_Byte`. That was the only byte of disagreement across the 98 captured block
definitions: `minecraft:red_shrub` turns its collision box off with no boxes in it, and the writer
gave the resulting empty list an element type the server never writes. All 98 now read and rewrite
byte for byte, and the generated definitions match the capture byte for byte too. The reader
already accepted both forms and still does, so worlds this server has already written load
unchanged. A behavior fix, so `patch` under
[the versioning policy](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/versioning.md)
below `1.0.0`.

`@jsprismarine/protocol` gains four things. `CreativeContentPacket` and `CraftingDataPacket` moved
here from `@jsprismarine/prismarine` and take plain payload types rather than the server's `Item`
and `Recipe` classes, so any package that builds those payloads can now be checked against them.
`CraftingDataPacket` carries a `potionMixes` list, where the old one wrote a literal zero and the
brewing recipes could not be sent at all. `BlockRuntimeId` holds the FNV-1a 32 hash and the little
endian state serialization that decide a block's runtime id, which `@jsprismarine/prismarine` had
one copy of and the protocol package another; it reproduces all 1065 `network_id` values the
captured creative catalog carries. The packet index exports every member type a `StartGame` payload
is built from, so a consumer no longer deep imports `@jsprismarine/protocol/packet/StartGamePacket`
to name a `BlockProperty` or a `GameRule`. Moving public API in is a feature, which the versioning
policy maps to `minor` below `1.0.0`.

`@jsprismarine/prismarine` keeps `CreativeContentPacket`, `CraftingDataPacket` and `BlockRuntimeIds`
with the same public interfaces and the same bytes on the wire; each now builds the payload and
hands it to the protocol package rather than carrying its own copy of the format.
