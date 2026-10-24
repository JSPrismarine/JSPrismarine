---
'@jsprismarine/protocol': minor
---

The shared wire structures in `@jsprismarine/protocol` now encode what protocol 2193 specifies, checked against hand-built byte vectors.

`DataItem` wrote one type byte where the docs have a one-of selector (varuint32) followed by the variant's own type byte, wrote a `Byte` value unsigned and an `Int64` value as a fixed eight bytes instead of a varint64. `ActorLink` gains the sixth field, `Vehicle Angular Velocity`. `PropertySyncData` never wrote its `Float Entries List` and could not deserialize. `ItemInstanceUserData` wrote a version byte and a compound even when it had none, used varint string lengths where the lists carry int16 lengths, and had no way to carry a shield's blocking tick; the marker is now derived from whether a compound is present, and `deserialize` takes a `shield` flag because nothing on the wire says a tick follows. `NetworkItemStackDescriptor` dropped a supplied `userDataBuffer`. `UUID` threw a `RangeError` for any half at or above 2^63, which is half of all random UUIDs. `ItemData` wrote `Item Id` as a varuint, which cannot carry a block item's negative id, and omitted `Item Version` and `Item Component Data`; the new `ItemVersion` enum names the version values.

Constructor signatures changed: `ActorLink` takes `vehicleAngularVelocity`, `ItemData` takes `version` and an optional `componentData`, and `ItemInstanceUserData` takes the compound (or null) first with the lists and blocking tick in its config.
