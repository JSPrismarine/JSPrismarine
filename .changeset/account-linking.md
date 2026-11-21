---
'@jsprismarine/prismarine': patch
---

Players can link a Java Edition account and an Xbox account with `/link` and `/unlink`, behind `account-linking` (on by default), so both play as one player with one record, one set of permissions and one live session. Links live in `account-links.json`. A verified Java account is now keyed by its UUID, so it never shares a saved record with a Bedrock player of the same name, and verified accounts of both editions may share a name and play at once. `PlayerIdentity` gains `linkedFrom`, and `playerKeyOf` reads the subject.
