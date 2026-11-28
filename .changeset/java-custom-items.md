---
'@jsprismarine/prismarine': patch
---

A Java Edition player sees an addon's custom items. Each item is sent as a vanilla base item, `minecraft:paper` unless its components need a bow or a snowball, that names a model of its own with `minecraft:item_model`. The item's name is a translation of its Bedrock name key. Its stack size, durability, food, cooldown and wearable slot become the components the client predicts from. The converted resource pack draws each model from the item's icon. The server keeps each item's base and model key in `java-content.json` beside `config.json`, made when it first sees the item and never changed, so a removed addon's items come back the same when it is reinstalled.
