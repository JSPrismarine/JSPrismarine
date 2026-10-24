---
'@jsprismarine/protocol': patch
---

`NetworkSettings.compressionAlgorithm` is typed as `PacketCompressionAlgorithm` instead of `number`, and `NetworkSettingsPacket` and `RequestNetworkSettingsPacket` document their protocol 2193 wire layout and ship byte-level tests.
