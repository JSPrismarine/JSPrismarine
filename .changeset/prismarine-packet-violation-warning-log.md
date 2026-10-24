---
'@jsprismarine/prismarine': patch
---

Log a client's `PacketViolationWarningPacket` at warning level with the rejected packet's name, the violation type and severity by name, and the client's context string. `PacketViolationWarningPacket` now exports `PacketViolationType` and `PacketViolationSeverity`, numbered from -1 as the client sends them.
