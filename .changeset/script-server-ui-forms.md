---
'@jsprismarine/script-host': patch
---

Behavior pack scripts can now show `@minecraft/server-ui` forms: `ActionFormData`, `ModalFormData` and `MessageFormData`, with their version 1 and version 2 signatures, `show()`, the three responses and `uiManager.closeAllForms`. The form JSON is byte for byte what Bedrock Dedicated Server sends, and a client's answer settles `show()` in the next script flush with what BDS settles it with: a selection, the form values, a cancel with its reason, or a `FormRejectError` for an answer that does not fit the form or a player who left. A world sends forms through the new optional `ScriptWorld.forms` channel. `ScriptApiContext` gains `tagOf`, the tag of an instance the host made, and `makeError`, which makes one of the API's errors without throwing it.
