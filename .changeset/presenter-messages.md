---
'@jsprismarine/prismarine': minor
---

`PlayerSession.sendMessage` takes a `kind` (`raw`, `chat`, `translation`, `system`, `announcement`, `whisper` or `rawText`) in place of a Bedrock `TextPacketType`, and no longer takes `platformChatId`. `ChatDelivery` carries `kind` in place of `type`, and `CHAT_TEXT_TYPE` is now `CHAT_MESSAGE_KIND`. The session's presenter picks the packet for the kind.
