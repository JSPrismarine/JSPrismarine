---
'@jsprismarine/protocol': patch
'@jsprismarine/client': patch
'@jsprismarine/bedrock-data': patch
---

Let the client speak protocol 2225, so a 1.26.60 server can be captured.

`Client` hardcoded protocol 2193, and a Bedrock Dedicated Server refuses a login at any version
but its own — pointing the capture at the pinned 1.26.60.6 server got "this client is out of
date" before a byte of data arrived. `ClientOptions` now takes a `protocolVersion`, the offline
identity reports the `GameVersion` that goes with it, and an unsupported version is refused in
the constructor rather than at the socket.

`StartGamePacket` is the one packet the client decodes whose layout moved at 2225: `Editor Level
Migration Version`, an int8 inserted into the level settings between `Is Exported From Editor`
and `Day Cycle Stop Time`. `@jsprismarine/protocol` gains `StartGamePacket2225`, a subclass over
two hooks on the 2193 class, with both wire directions and round-trip coverage. A 2193 reader on
2225 bytes is one byte out from the insert on, so the block properties a capture is run for come
back wrong; whether the rest resynchronizes is luck, which the tests say in those terms.

`capture-server-data.mjs` takes `--protocol`, and the `packets` pass of `dump:bedrock` passes the
version it staged.
