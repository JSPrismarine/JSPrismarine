---
'@jsprismarine/block-behaviors': patch
---

Spread grass and mycelium as Java's `SpreadingSnowyBlock` does: in light 9 or more above it, a block makes four attempts at a random block up to one across, three below or one above, and spreads onto dirt that could carry grass and has no water above it. It dies under an opaque block or a water source, a waterlogged block's water included, and lives under a single snow layer. It used to try only its six face neighbors, at 1/4 each in light 4.
