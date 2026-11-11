---
"@jsprismarine/client": minor
---

Remove `isPacket` and `ClientboundPacketData` from `net/ClientPacketRegistry`. They narrowed a decoded packet's `data` on its id alone, which was only right while each id was registered to the class whose payload the type listed. Register a handler with `ClientSession.registerHandler(PacketClass, handler)`, which types the payload from the class, or narrow with `decoded.packet instanceof PacketClass` and read `getPacketData()`. The `connect` command of the CLI prints chat through a handler now.
