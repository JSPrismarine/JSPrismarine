---
'@jsprismarine/block-behaviors': patch
---

Keep the crop when farmland dries all the way out. Java's `shouldMaintainFarmland` turns only bare farmland back to dirt; this server reverted a dry field on its next random tick with the wheat still standing in it, which popped the crop.
