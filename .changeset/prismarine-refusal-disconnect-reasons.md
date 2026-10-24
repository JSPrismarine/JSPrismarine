---
'@jsprismarine/prismarine': patch
---

A refused login now ends the way the protocol docs describe. A client on the wrong protocol gets the `LoginFailed_ClientOld` or `LoginFailed_ServerOld` play status and then a disconnect carrying `OutdatedClient` or `OutdatedServer`, from both `RequestNetworkSettingsHandler` and `LoginHandler`. A full server sends `LoginFailed_ServerFullSubClient` and then a disconnect carrying `ServerFull`. `LoginHandler` used to send the status and leave the connection open, and `RequestNetworkSettingsHandler` sent the generic `Disconnected` code. `PlayerSession.sendPlayStatus` now takes a `PlayStatusType` instead of any number.
