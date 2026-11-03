---
'@jsprismarine/block-behaviors': patch
---

Keep a lit cooker at three slots. Lighting a furnace, blast furnace, or smoker swaps it for its own `lit_` block, and the slot table only knew the cold names, so a burning one fell back to a chest's 27. That put a 27-slot backing behind the three-slot furnace screen, which the client drew as empty: a furnace mid-smelt opened showing no input, no fuel, and no output.
