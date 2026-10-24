---
'@jsprismarine/protocol': patch
---

Add `ClientboundAttributeLayerSyncPacket` (id 345) with its `Data` tagged variant (`UpdateAttributeLayersData`, `UpdateAttributeLayerSettingsData`, `UpdateEnvironmentAttributesData`, `RemoveEnvironmentAttributesData`) as a discriminated union on `AttributeLayerSyncDataType`, plus the `AttributeLayerData`, `AttributeLayerSettings`, `EnvironmentAttributeData` and `NoiseAlignment` structures and the `BoolAttributeOperation`, `FloatAttributeOperation` and `ColorAttributeOperation` enums.
