---
'@jsprismarine/prismarine': minor
---

`StructureSettings` and its `Rotation`, `Mirror` and `AnimationMode` enums now live in `network/type/StructureSettings`, together with `defaultStructureSettings`, `readStructureSettings` and `writeStructureSettings`. `StructureBlockUpdatePacket` and `StructureTemplateDataRequestPacket` share them instead of each exporting its own copy; the `Structure*`-prefixed enums are gone, and `Rotation` carries the docs' `Clockwise90`, `Clockwise180` and `CounterClockwise90` aliases for 1, 2 and 3. Field names follow the docs: `shouldIgnoreEntities`, `shouldIgnoreBlocks`, `shouldAllowNonTickingPlayerAndTickingAreaChunks` on `StructureSettings` and `shouldIncludePlayers`, `shouldShowBoundingBox` on `StructureEditorData`. Wire bytes are unchanged.
