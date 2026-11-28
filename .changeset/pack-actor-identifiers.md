---
'@jsprismarine/prismarine': patch
---

A behavior pack's own entities now show up for Bedrock players. The join's `AvailableActorIdentifiersPacket` listed only vanilla types, and the client creates no actor of a type the list leaves out, so an addon's entity, such as Real Ragdoll's corpse, spawned on the server and was never drawn. Each pack type is now listed as Bedrock Dedicated Server lists it.
