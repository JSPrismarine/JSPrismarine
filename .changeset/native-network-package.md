---
'@jsprismarine/native-network': patch
'@jsprismarine/raknet': minor
---

Add `@jsprismarine/native-network`, JSPrismarine's networking in native code: WebRTC peer connections and data channels on libdatachannel with Mbed TLS, bound through `node:ffi` and `bun:ffi`, and `SharedPort`, a UDP port that RakNet and NetherNet share, sorted by each datagram's bytes before libjuice's lookup. This release builds from source only; prebuilt libraries follow.

`SharedByteRing` in `@jsprismarine/raknet` now has eight control slots, with a wake flag (`claimWake` and `clearWake`), and needs a power-of-two capacity, so native code can read and write the same rings. A ring made with any other capacity is refused.
