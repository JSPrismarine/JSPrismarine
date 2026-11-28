---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/block-behaviors': patch
---

A form's answer, a book and quill edit and a command block's or a command block minecart's edit are intents, run by `AnswerFormHandler`, `EditBookHandler`, `EditCommandBlockHandler` and `EditCommandMinecartHandler` under `input/handlers/`. Bedrock's `BookEdit` and `CommandBlockUpdate` packets decode into them, replacing their packet handlers, and a Java client's `Edit Book`, `Set Command Block` and `Set Command Minecart` decode into the same ones, which the protocol package now defines. `CommandBlockEdit`'s `customName`, `tickDelay` and `executeOnFirstTick` and `MinecartCommandEdit`'s `customName` are optional, and an edit that leaves one out keeps the block's or the cart's own, since a Java client's screen sends none of them.
