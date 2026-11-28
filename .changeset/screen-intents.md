---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

An anvil's wear, a crafter's slot toggle, an Education Edition lab table action and a recipe book's settings are intents, run by `DamageAnvilHandler`, `ToggleCrafterSlotHandler`, `UseLabTableHandler` and `SetRecipeBookHandler` under `input/handlers/`. Bedrock's `AnvilDamage`, `PlayerToggleCrafterSlotRequest`, `LabTable`, `SetPlayerFurnaceOptions` and `SetPlayerInventoryOptions` packets decode into them, replacing their packet handlers, and a Java client's `Change Recipe Book Settings` decodes into the recipe book's. The `editions/bedrock/handler/AnvilDamageHandler` subpath is gone; run the `damageAnvil` intent with `DamageAnvilHandler` instead. The protocol package defines `Change Recipe Book Settings`.
