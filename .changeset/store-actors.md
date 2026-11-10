---
"@jsprismarine/prismarine": patch
---

Show the store's entities to clients from store state. A `StoreActor` answers the network layer for each data-driven entity, and the per-tick moves, metadata, health and equipment updates are sent from the store rather than from a legacy body that copied it. The network layer reads actors through the structural `ShownActor` interface, which a legacy `Entity` satisfies as it is. Clients see the same packets as before.
