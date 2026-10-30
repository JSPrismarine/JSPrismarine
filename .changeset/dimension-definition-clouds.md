---
'@jsprismarine/protocol': patch
---

Carry `Cloud Height` and `Render Clouds` in `DimensionDefinition` at protocol 2225. The structure is now a declarative field list gated by `SINCE_2225`, and `DimensionDataPacket` writes and reads each definition in the layout of the connection's protocol version. The `DimensionDefinition` constructor gains `cloudHeight` and `renderClouds` after `defaultBiome`, both defaulted, and `serialize`/`deserialize` accept an optional protocol version that defaults to 2193.
