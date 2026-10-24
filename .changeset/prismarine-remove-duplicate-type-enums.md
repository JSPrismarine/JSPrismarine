---
'@jsprismarine/prismarine': minor
---

Remove `network/type/AnimateActionType` and `network/type/ViolationType`, and the `Types.AnimateActionType` export. Both duplicated enums that the packet files already define with the docs' names: use `AnimateAction` from `network/packet/AnimatePacket` and `PacketViolationSeverity` from `network/packet/PacketViolationWarningPacket`.
