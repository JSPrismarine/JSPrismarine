---
'@jsprismarine/packs': minor
---

Keep every pack's `item_catalog/crafting_item_catalog.json`. The `itemCatalog` registry now keys a catalog by its pack's header UUID and path, so two packs that each ship one both reach the creative menu, and only a later layer of the same pack replaces a pack's catalog.
