---
'@jsprismarine/protocol': patch
---

Add `CameraPresetsPacket` (id 198) with a `CameraPreset` structure and the `CameraAudioListener`, `AimAssistTargetMode` and `ControlScheme` enums. `NetworkBinaryStream` gains `readOptional` and `writeOptional` for fields Cereal binds as `brstd::optional<T>`: a presence byte, then the value.
