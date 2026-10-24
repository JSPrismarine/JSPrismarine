---
'@jsprismarine/protocol': patch
---

Add `CameraAimAssistPresetsPacket` (id 320) and the structures it lists: `CameraAimAssistCategoryDefinition`, `CameraAimAssistCategoryPriorities`, and `CameraAimAssistPresetDefinition`. Categories come first, then presets, then the `Operation` byte, in the order protocol 2193 defines.
