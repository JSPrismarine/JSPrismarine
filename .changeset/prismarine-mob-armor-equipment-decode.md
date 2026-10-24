---
'@jsprismarine/prismarine': patch
---

`MobArmorEquipmentPacket` can be decoded as well as encoded, and both equipment packets have
tests that pin the protocol 2193 byte layout: the runtime id, then one full
`NetworkItemStackDescriptor` per slot with an empty slot written as eight zero bytes.
