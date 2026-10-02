---
'@jsprismarine/protocol': minor
'@jsprismarine/raknet': minor
---

Add the batch layer to `@jsprismarine/protocol`, and a socketless RakNet pair to `@jsprismarine/raknet`.

**`BatchCodec` and `CompressionCodec`.** The outermost Minecraft layer - `0xFE`, an optional algorithm byte, then length-prefixed packets - as something both sides of a connection can use, and which knows nothing about what a packet *is*. A batch is a list of opaque buffers, which is what lets it serve a client, a server and a proxy alike.

The distinction it draws that the server's `BatchPacket` does not: the algorithm byte is present if and only if compression has been *negotiated*, which is not the same as this batch being compressed. `RequestNetworkSettings` and `NetworkSettings` carry no prefix; from the next packet onward every batch carries one, and a peer may set it to `0xff` whenever compressing would not pay. Those are two codecs - `BatchCodec.uncompressed()` and `BatchCodec.compressed()` - rather than one boolean.

Three things fall out of writing it as a codec rather than a packet:

- **A compression threshold**, so a small payload goes out uncompressed and says so, instead of deflate reliably making it larger. Mojang's threshold of 0 means "never compress"; read as a plain `byteLength >= threshold` it would have meant the exact opposite.
- **Bounded inflation.** A batch arrives inside one RakNet message, so the compressed bytes are bounded at roughly 2.8 MiB by reassembly - what they *expand* to was bounded by nothing, and both a client and a server read compressed bytes from a peer they have not authenticated. zlib now enforces a ceiling itself.
- **Strict splitting.** Every declared length is checked against what actually remains, and the error says at which offset the batch went wrong. An empty batch yields no packets: the `do/while` this replaces always ran once and read a varint out of nothing.

`BatchCodecInterop.test.ts` in `@jsprismarine/prismarine` pins the two implementations together, byte for byte in both directions. They will not be swapped for one another in a single commit - the client is built on the codec while the server still runs `BatchPacket` - so for as long as both exist, a disagreement between them is a client that cannot talk to this server.

**`LoopbackSocket`.** A connected RakNet pair with no sockets under it, for running a server in the same process as its client. The server keeps talking to a `RakNetSession` and cannot tell it is not on a wire.

Framing, ordering, acknowledgement, reassembly and the connected handshake are the ordinary `Session`, unmodified - the alternative, handing frames across directly, would have meant reimplementing `Session.handlePacket`, and single player would then run *similar* code to multiplayer rather than the same code. What is skipped is the offline exchange, which exists only to discover a path MTU and a guid across a network that is not there.

Two details it has to get right: delivery goes through a microtask, so a packet answered inline does not nest a second delivery inside the first; and the MTU is 8 KiB rather than "as large as possible", because `Frame` writes its content length *in bits* into an unsigned 16 bit field and anything past 8191 bytes silently wraps it. That is still five and a half times what a real connection negotiates, so a chunk batch that fragments seventeen ways on the wire fragments three ways here.

`Loopback.test.ts` runs the same five scenarios twice, once over real sockets and once in memory, and asserts the two agree.
