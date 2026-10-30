---
'@jsprismarine/protocol': minor
'@jsprismarine/prismarine': minor
---

Every packet wire layout now lives in `@jsprismarine/protocol`, so a third party can speak the
Bedrock protocol without the server package. The eight layouts the server still defined -
AddActor, AddPlayer, GameRulesChanged, InventoryTransaction, PlayerList, PlayerSkin,
SetActorData and UpdateAttributes - join the protocol package's registry, together with the
structures they carry: `NetworkUtil`, `Attribute`, `Metadata`, `SyncedProperties`, `GameRule`,
`PassengerOfBlock`, `UUID`, `Skin`, `PlayerListEntry`, the inventory transaction's bodies and a
`NetworkItemStackDescriptor` codec. The protocol package gains a dependency on
`@jsprismarine/math` for the positions those structures carry.

The server re-exports each moved structure from its old path, so existing imports keep working.
`network/codec/prismarineWireDefinitions` and `network/wire/fieldTypes` are gone - the one
registry is `wireDefinitions` - and `AddPlayerPacket.carriedItem` is the stack descriptor the
layout carries rather than an `Item`; the packet's own `item` property is unchanged.
