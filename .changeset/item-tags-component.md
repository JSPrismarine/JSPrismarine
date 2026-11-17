---
'@jsprismarine/protocol': patch
---

Write an item's Bedrock tags as the `minecraft:tags` component as well as `item_tags` in `buildItemRegistry`, as the Bedrock Dedicated Server does whenever the list is not empty. A client reads that component to match a component-based item against a recipe's tag, so coal and charcoal were not `minecraft:coals` to it. The recipe book then hid the torch recipes and showed the wrong craftable state.
