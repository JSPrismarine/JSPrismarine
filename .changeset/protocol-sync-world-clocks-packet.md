---
'@jsprismarine/protocol': patch
---

Add `SyncWorldClocksPacket` (id 344) with its `Data` tagged variant: `SyncStateData`, `InitializeRegistryData`, `AddTimeMarkerData` and `RemoveTimeMarkerData`, exposed as a discriminated union on `SyncWorldClocksDataType`.
