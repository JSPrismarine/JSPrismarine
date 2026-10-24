---
'@jsprismarine/protocol': patch
---

Add `ServerboundDataStorePacket` (id 332), whose payload is a single `DataStoreUpdate`: `Data Store Name`, `Property`, `Path`, the `Data` one-of, `Property Update Count`, and `Path Update Count`, in the order protocol 2193 defines.
