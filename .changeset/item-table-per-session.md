---
'@jsprismarine/prismarine': patch
---

Send each session the item numbering of the protocol it negotiated.

`@jsprismarine/bedrock-data/v2225` has shipped the 1.26.60 item table since the capture landed,
but nothing selected it: `item_table` was a module-level import, so a session that negotiated
2225 was still handed 2193's numbering. The registry is server-authoritative, so that never
refused a join — it left the four names 1.26.60 added unreachable and put 82 items on numbers no
other 1.26.60 server uses.

`ProtocolCodec` now carries a `ProtocolItemData` beside its packet layouts: a version fixes the
item numbering as firmly as it fixes a packet's field order, and both now travel with the codec
the session resolved. `ItemRegistryPacket` reads it through the version a codec stamps on an
outbound packet, `contentPayloads` takes it as an option and caches a build per version, and an
item stack takes it from the packet it is being written to or read from — a stack's number and
the registry's have to agree, or those 82 items resolve to the wrong item in the session they
were sent correctly to. `prepareOutbound` now stamps the version on every outbound packet rather
than only on one whose class it substituted, which is what lets a packet with one class at both
versions carry version-specific data.

Server-side code that asks whether Bedrock has an item at all, rather than what number to write
for it, keeps reading the canonical 2193 table: `CreativeInventory`'s catalog filter,
`RecipeManager.isKnown`, and the `items` code generator. Those are membership questions, and the
recipes a client is sent name their items rather than numbering them.

Protocol 2193 is byte-identical: `ItemRegistryPacket` encodes the same buffer it did before a
version was selectable, which is asserted directly, and a version no table was captured for falls
back to the same table. The `registry.items-2225` parity family now checks what a session is sent
rather than only what the package publishes.
