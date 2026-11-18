---
'@jsprismarine/client': patch
---

Write each packet the client sends in the layout of the protocol it negotiated. Packets went out in protocol 2193's layout whatever the session spoke, so at 2225 an `AnimatePacket` arrived one byte short and the server dropped the swing. `ClientPacketRegistry.protocolVersion` is now public.
