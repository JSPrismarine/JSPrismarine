---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

Decode a player's packets into intents and handle each intent once, whichever edition sent it (ADR 0027). `PacketHandlerRegistry.getIntentHandlers()` is where a plugin registers or appends behavior by intent kind; raw packet handlers register as before. The interact, animate and boss event packets are the first to go through a decoder.
