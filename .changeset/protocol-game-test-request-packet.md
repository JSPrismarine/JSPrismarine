---
'@jsprismarine/protocol': patch
---

Add `GameTestRequestPacket` (id 194) with the `Rotation` enum, written in the order protocol 2193 defines: two ZigZag varint32 counts, the rotation byte, the stop flag, a `BlockPos`, the tests-per-row count, then the test name.
