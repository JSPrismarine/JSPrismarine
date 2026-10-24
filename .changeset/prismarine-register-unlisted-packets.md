---
'@jsprismarine/prismarine': patch
---

Register `SimpleEventPacket`, `MultiplayerSettingsPacket`, `DebugInfoPacket`, `LegacyTelemetryEventPacket` and `ClientboundDebugRendererPacket` with the packet registry, and `SimpleEventHandler` and `MultiplayerSettingsHandler` with the handler registry. A client flipping the commands switch or asking for an Education Edition join code is now decoded and logged at debug level instead of being reported as an unimplemented packet.
