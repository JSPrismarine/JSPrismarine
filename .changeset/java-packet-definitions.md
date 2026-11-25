---
'@jsprismarine/protocol': minor
'@jsprismarine/errors': patch
---

Java Edition packets are now `definePacket` definitions, as Bedrock's are, and name their packet by phase, direction and Mojang's name instead of by number. Each release's generated table gives the number, so `encodeJavaPacket`, `decodeJavaPacket` and the new `javaPacketId` take the release the connection speaks, and `NEWEST_JAVA_RELEASE` carries its packet ids. `defineJavaPacket` takes a `phase/direction/name` path in place of an id.
