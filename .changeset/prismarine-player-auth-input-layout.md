---
'@jsprismarine/prismarine': patch
---

`PlayerAuthInputPacket` documents the protocol 2193 wire layout with the docs' field names, derives its input flag bound from `PlayerAuthInputData` instead of a hand-kept constant, refuses more than the docs' 100 block actions before allocating for them, and exports the `InputMode`, `ClientPlayMode` and `NewInteractionModel` enums with the numbering the 1.26.60 docs corrected.
