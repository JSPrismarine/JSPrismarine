---
'@jsprismarine/prismarine': patch
---

`/give` now raises the `inventory_changed` advancement trigger for the stack it gives, as Java does, so an advancement for holding an item completes when a command gives it.
