---
'@jsprismarine/protocol': patch
---

Add `ClientboundDataStorePacket` (id 330) and the `DataStoreUpdate` structure it shares with `ServerboundDataStorePacket`. Each `Updates` entry is a tagged variant over `Data Store Update`, `Data Store Change`, and `Data Store Removal`, in the order protocol 2193 defines.
