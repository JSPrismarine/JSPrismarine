---
'@jsprismarine/prismarine': minor
'@jsprismarine/errors': patch
---

A player's own inventory reaches its client through the session's presenter: `BedrockPresenter` sends the inventory, one of its slots, the held item and the armor, with the stack network ids a Bedrock client names stacks by, and `SessionPresenter` gains `openOwnInventory`, which opens the inventory screen. `BedrockSessionState` gains `inventory`, what the presenter reads those from, and a presenter built without it throws `PresenterHasNoSession` when asked to show the inventory. `ShownContainer` adds `cursor`. `PlayerSession.sendHandItem` and `sendArmorFor` are gone, and `sendInventory` no longer takes a window id.
