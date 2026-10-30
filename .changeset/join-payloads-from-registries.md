---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

Send the four join payloads from the content registries. `StartGamePacket`'s block properties,
`ItemRegistryPacket`, `CreativeContentPacket` and `CraftingDataPacket` are written from
`ServerContent` when `content-packs` is on, and from the captured tables when it is off, which is
still the default. `joinContentPayloads` builds them once at startup, logs what the build sends and
warns about what it had to invent, and returns nothing rather than throwing, so a build whose
payloads cannot be produced leaves every packet on the path it used before.

Measured against the captures for the vanilla pack stack: all 98 block definitions come out byte
identical and the whole `StartGamePacket` matches the captured path; all 1606 items both sides name
take the capture's number, component flag and version; and the creative menu is the same 1980
entries in the same order with the same ids, metas, block ids and groups, 175 of which now carry
the NBT the old path dropped. Creative picks are read against the menu that went out, so the two
cannot disagree about which entry a position names.

Two gaps are recorded rather than hidden. Mojang's vanilla behavior pack files seven items under
pre-flattening names (`minecraft:fish`, `minecraft:muttonRaw` and five more) that a dedicated
server renames before writing its table, so those seven travel with ids of this server's own; all
seven modern names are in the registry as well. And the item component compounds come from Java's
components rather than Mojang's tables, so none of the 78 captured compounds is reproduced byte for
byte; `@jsprismarine/protocol` measures that gap field by field.
