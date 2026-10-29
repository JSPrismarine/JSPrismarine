---
'@jsprismarine/prismarine': patch
---

Route block and block entity changes through a typed `WorldChange` stream: the world emits `block-set` and `block-entity-set` changes through its change sink's `worldChanged`, and the network replicator translates them into packets. The wire behavior is unchanged.
