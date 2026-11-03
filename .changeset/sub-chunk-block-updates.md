---
'@jsprismarine/prismarine': patch
---

Send a tick's block changes as one `UpdateSubChunkBlocksPacket` per sub chunk instead of one `UpdateBlockPacket` per block. A `/fill` of twenty thousand blocks put twenty thousand packets in a single batch, and a real Bedrock client drops the connection about ten seconds later with nothing logged on either side; the same region now travels as eighty-one packets in a batch of the same size, and the client stays on. A sub chunk with one change still sends the shorter single-block update, which is what a placement or a break is.
