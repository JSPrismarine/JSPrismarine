---
'@jsprismarine/prismarine': minor
---

Chat reaches players in one pass after the `chat` event. `ChatManager.send` posts the event, calls its listeners in the order they subscribed, and then delivers the message to every joined player its channel reaches, unless a listener canceled it before its first wait. A listener that cancels now stops every player, including those who joined before the listener subscribed, and `removeAllListeners('chat')` no longer takes chat away from players. `ChatManager` takes a bus with `post` (`ChatBus`). The player join message goes through `ChatManager.send`, and the handler services' `events` has only `post`.
