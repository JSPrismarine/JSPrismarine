---
'@jsprismarine/prismarine': minor
'@jsprismarine/bedrock-data': patch
---

Add the codec for Minecraft: Bedrock Edition's on-disk chunk format, so a world folder can be read and written exactly as the game writes it.

- **Keys.** Chunk records are addressed by x and z as signed little endian int32s, the dimension only when it is not the Overworld, a tag byte, and for a sub chunk a *signed* index byte - 0xfc is -4, the Overworld's bottom slice. Non-chunk keys such as `~local_player` and `portals` are recognised as not being chunk records rather than mis-parsed.
- **Sub chunks.** Versions 1, 8 and 9, including the second storage layer that water-logging uses. The version a sub chunk was read at is kept, so writing it back does not silently upgrade it.
- **Block storage.** The same bit packing as the network form, but with the persistent flag clear, a fixed width palette count, and each palette entry an NBT compound of `{name, states, version}`. Palette entries go through the existing `BlockRuntimeIds`, which already hashes exactly that compound - so there is no second mapping table to keep in step. A block this version does not know resolves to the unknown id, and a known block with an unknown property value falls back to its default state, rather than either making a whole world unreadable.
- **Biomes.** The `Data3D` record: a 512 byte heightmap measured from the world floor, then one palette per sub chunk with little endian int32 biome ids, including the header byte that means "the same as the sub chunk below" and the truncated tail the game leaves when the rest would all inherit.
- **level.dat.** The 8 byte header and little endian NBT payload, plus `levelname.txt`, keeping the previous file as `level.dat_old` the way the game does.

`BlockStorage` gains `getPalette` and `getPaletteIndexAt`, which the disk codec needs to write the packed indices directly instead of round-tripping every block through the palette. `@jsprismarine/bedrock-data` now exports `biome_id_map`.
