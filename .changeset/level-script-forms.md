---
'@jsprismarine/prismarine': patch
---

Behavior pack scripts' `@minecraft/server-ui` forms now reach the default level's players as `ModalFormRequestPacket`s, and `uiManager.closeAllForms` sends a `ClientboundCloseFormPacket`. A client's `ModalFormResponsePacket` is now an input of the tick it arrives in, which the scripts' next flush settles the form with. A client that answers with text that is not JSON is disconnected, as Bedrock Dedicated Server disconnects it.
