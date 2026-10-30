---
'@jsprismarine/protocol': minor
'@jsprismarine/prismarine': minor
---

Implement the eight packets protocol 2225 added.

Their ids have been in the 2225 table since the delta codec landed, as protocol surface a codec
knew about but could not build, so a 1.26.60 session decoded each to `null`. All eight now have
a declarative layout and a packet class: the two matchmaking packets, the two stonecutter ones,
`SetPassengerOfBlock`, `ServerboundCursorItemDrag`, and the two audio content packets.

Every layout is read off Mojang's v1.26.60 release schemas, the `metadata.zip` this repository
already pins, using the ordinals and serialization options those schemas declare. That decides
two things a careless reading gets wrong: an integer marked `Compression` is a ZigZag varint
rather than a fixed-width little-endian value, which is what `Recipe Index` is, and a property
the schema leaves out of `required` travels behind a presence byte. No capture exercises these
packets, because a vanilla login sends none of them, so each definition carries its ordinals and
a round-trip test instead; `docs/research/protocol-2225-added-packets.md` records the provenance.

Registering a packet now resolves its id against the newest registered codec rather than 2193,
since a packet a later protocol added has no id at the older one.
