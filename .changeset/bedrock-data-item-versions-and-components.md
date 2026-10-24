---
'@jsprismarine/bedrock-data': patch
---

`item_table` entries now carry `version`, the `Item Version` a Bedrock Dedicated Server 1.26.51 sends for the item (0 `Legacy`, 1 `DataDriven`, 2 `None`), and a new `item_components` export maps the 78 vanilla items that travel with component data to that data as network NBT. Both come from the CloudburstMC data submodule; the generator checks that its item list agrees with the captured table before producing either.
