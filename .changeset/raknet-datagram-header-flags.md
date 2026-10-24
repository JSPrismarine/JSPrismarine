---
'@jsprismarine/raknet': patch
---

`BitFlags` names the two remaining datagram header bits, `CONTINUOUS_SEND` (0x08) and `NEEDS_B_AND_AS` (0x04), and documents that `FrameSet` accepts and ignores them, as RakNet's sliding window congestion control does. No wire behavior changes.
