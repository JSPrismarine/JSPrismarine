---
'@jsprismarine/protocol': patch
---

Add `CameraAimAssistActorPriorityPacket` (id 339): a list of `AimAssistActorPriorityData` entries, each four little-endian int32s (`Preset Index`, `Category Index`, `Actor Index`, `Priority Value`), as protocol 2193 defines.
