---
'@jsprismarine/prismarine': minor
---

`PlayerSession.sendCreativeContents` and `PlayerSession.sendCraftingData` are removed. The Bedrock join burst sends the creative menu and the recipes through `sendCreativeContents(session, join)` and `sendCraftingData(session, join)` in `editions/bedrock/joinContent`, from the content, the payloads and the limits the burst already holds. The option to send an empty creative menu is gone, since nothing used it. A handler's `services.creativeInventory` also offers `getGroups` and `getEntries`.
