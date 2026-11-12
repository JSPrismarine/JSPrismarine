---
'@jsprismarine/nethernet': minor
'@jsprismarine/prismarine': patch
---

NetherNet messages are framed as Bedrock frames them. A message is split at what the peer's `a=max-message-size` allows, 262,143 bytes for a Bedrock client, into at most 255 segments, where it used to be split every 10,000 bytes into at most 256. A message the peer sends on `UnreliableDataChannel` is delivered instead of dropped, as Mojang's guide asks.

A connection now bounds what a peer can make it hold. It closes with `badsegment` on a message longer than `maxMessageBytes`, with `sendbacklog` once more than `maxBufferedBytes` (64 MiB by default) waits unsent, and with `sendfailed` when the channel refuses a segment. The server accepts messages up to the 16 MiB a batch may inflate to, and holds at most 64 KiB for a peer that has not opened.

`SEGMENT_BYTES` is 262,143 and `MAX_MESSAGE_BYTES` is 255 segments of it; code that relied on the old values must change. `segment` takes the segment size, `Reassembler` a limit, and `Connection`, `NetherNetServer` and `NetherNetClient` take `ConnectionOptions`. The package adds `MAX_SEGMENTS`, `segmentBytesFor` and `DEFAULT_MAX_BUFFERED_BYTES`.
