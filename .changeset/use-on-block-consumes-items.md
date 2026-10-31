---
"@jsprismarine/prismarine": patch
"@jsprismarine/blocks": patch
"@jsprismarine/block-behaviors": patch
---

Carry an `onUseOn` behavior's stack result back to the player's hand, so bone meal and other consumables used on a block are spent. An `onPlayerInteract` block hook can now answer with `{ consumed: true, consumesHeldItem: true }`, which the interaction dispatch charges to the hand outside creative; the portal family uses it to spend the eye of ender that fills an end portal frame.
