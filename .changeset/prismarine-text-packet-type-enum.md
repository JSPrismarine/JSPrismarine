---
'@jsprismarine/prismarine': minor
---

Rename the `TextType` enum to `TextPacketType`, the docs' name for the Message Type of `TextPacket`, and move it from `network/type/TextType` to `network/type/TextPacketType`. `Types.TextType` is now `Types.TextPacketType`. Members now use the docs' names: `Translation` is `Translate`, `System` is `SystemMessage`, and `JsonWhisper`, `Json`, `JsonAnnouncement` are `TextObjectWhisper`, `TextObject`, `TextObjectAnnouncement`. Values are unchanged.
