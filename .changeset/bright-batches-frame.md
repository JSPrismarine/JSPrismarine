---
"@jsprismarine/prismarine": minor
---

Remove Prismarine's `BatchPacket` wrapper and frame packet arrays through Protocol's `BatchCodec`. Session codecs still prepare each packet for the negotiated protocol version before framing.
