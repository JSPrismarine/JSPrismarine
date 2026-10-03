---
'@jsprismarine/prismarine': patch
---

Read a batch the client chose not to compress, instead of dropping the login.

The compression algorithm travels at two widths that do not agree. `NetworkSettingsPacket` negotiates it in a two byte field, where "none" is `0xffff`; every batch afterwards repeats it in a *single* byte, where none is `0xff`. Reading that byte straight into `PacketCompressionAlgorithm` matched neither ZLIB, SNAPPY nor NONE, fell through to the unsupported branch and threw.

It showed up as `Failed to inflate batched content` a few packets into a login that had otherwise completed - the big packets are compressed and decoded fine, so the first small one the client sent uncompressed was the first to fail, and the client then sat until it timed out.

`CompressionProvider.fromBatchPrefix` now widens the byte to the negotiated form, and `BatchPacket` goes through it on both decode paths. The encode side already wrote `ZLIB` as a byte, which is 0 either way.
