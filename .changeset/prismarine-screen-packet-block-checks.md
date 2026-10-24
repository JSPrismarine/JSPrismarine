---
'@jsprismarine/prismarine': patch
---

The handlers for `StructureBlockUpdate`, `StructureTemplateDataRequest`, `LecternUpdate`, `LabTable`, `AnvilDamage` and `PlayerToggleCrafterSlotRequest` drop a packet whose position is out of reach, in a chunk that is not loaded, or not the block the screen belongs to, and log the reason at verbose level. `BookEditHandler` drops an edit whose slot holds no book and quill or whose page number a book cannot have. None of these blocks are stored yet; the checks keep a crafted packet from being taken at its word or from loading terrain.
