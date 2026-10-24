---
'@jsprismarine/prismarine': minor
---

Rename the `PlayStatusType` enum to `PlayStatus`, the docs' name, and move it from `network/type/PlayStatusType` to `network/type/PlayStatus`. Its members now carry the docs' names: `LoginFailedClient` is `LoginFailed_ClientOld`, `LoginFailedServer` is `LoginFailed_ServerOld`, `LoginFailedInvalidTenant` is `LoginFailed_InvalidTenant`, `LoginFailedVanillaEdu` and `LoginFailedEduVanilla` are `LoginFailed_EditionMismatchEduToVanilla` and `LoginFailed_EditionMismatchVanillaToEdu`, `LoginFailedServerFull` is `LoginFailed_ServerFullSubClient`, and `LoginFailedEditorVanilla` and `LoginFailedVanillaEditor` are `LoginFailed_EditorMismatchEditorToVanilla` and `LoginFailed_EditorMismatchVanillaToEditor`. Values are unchanged.
