---
'@jsprismarine/commands': minor
'@jsprismarine/prismarine': patch
---

`execute if slots (block <pos>|entity <targets>) <slot_source>` counts the slots a slot source selects, instead of answering 0, and `execute if items` reads its slots as a slot source too, as Java 26.3 does. A slot source is a slot name, the id or `#tag` of a datapack's slot source, or one written as SNBT, and all six of Java's types are evaluated. `DataCommandHost` has a new required verb, `countSlots`, which a host implements to answer it.
