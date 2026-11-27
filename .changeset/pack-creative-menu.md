---
'@jsprismarine/protocol': patch
'@jsprismarine/prismarine': patch
---

List a behavior pack's blocks and items in the creative menu. A block or item whose `description.menu_category` names a category other than `none` now gets a `CreativeContentPacket` entry, filed as the pinned Bedrock Dedicated Server files it: a `minecraft:` group joins that vanilla heading, any other group opens a heading of its own, and an entry with no group joins the last nameless heading of its tab. A pack item's registry entry now carries the `creative_category` and `creative_group` its file declares. An item catalog group named in the `minecraft` namespace, such as `minecraft:itemGroup.name.planks`, now joins that vanilla heading instead of opening a new one. `@jsprismarine/protocol` adds `withPackMenuPlacements` and `creativeGroupName`, and a creative catalog entry can carry a `block_runtime_id`.
