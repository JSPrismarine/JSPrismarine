---
'@jsprismarine/prismarine': patch
---

`ItemRegistryPacket` sends each item with the `Item Version` and `Item Component Data` a Bedrock Dedicated Server 1.26.51 sends, instead of `DataDriven` and an empty compound for all 2076 items. The 31 data-driven vanilla items (bundles, spears, trial keys, the apple) now reach the client with the components it builds them from.
