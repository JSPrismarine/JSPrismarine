---
"@jsprismarine/prismarine": patch
---

Honor the negotiated protocol codec on the outbound path. A session's codec now converts base
packet instances to its own classes before encoding, so a protocol 2225 client receives the
2225 wire layouts for the packets that changed - `StartGamePacket` among them - instead of
the 2193 bytes. Shared-batch broadcasts compress once per codec rather than once globally, so
a mixed-version audience each receives its own layout.
