---
'@jsprismarine/protocol': minor
'@jsprismarine/client': patch
---

Add the wire layouts of Minecraft Preview protocol 2259 (1.26.70.24). `ResourcePackStack.includeEditorPacks` is now `editorPackTypes`, a set of `EditorPackType` flags written as a byte from 2259 and as a boolean before it. `CommandBlockUpdate`, `StructureBlockUpdate` and `Transfer` payloads gain the fields 2259 appended (`lastOutputIsRawMessage`, `keepStructureVoid`, `transferSettings`), which read as their defaults at older protocols. `NetworkSettings` accepts an optional `sctpRecoveryProfile`. `PlaySoundPacket`, `CommandOutputMessage`, the `Text` body, `ServerJoinInformation` and `PassengerOfBlock` gain optional members for their 2259 fields. A field spec can now name its layout per protocol version with `versioned()`. The client can speak 2259, and its capture and bring-up tools take `--network`.
