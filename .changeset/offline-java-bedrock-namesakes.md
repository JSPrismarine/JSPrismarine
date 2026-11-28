---
'@jsprismarine/prismarine': minor
---

A Java Edition player and a Bedrock player who share a name can both play on a server with `online-mode` off. Each login used to replace the other with "Logged in from another location", because both were filed as the same offline account. An offline Java player's record is now filed under the UUID vanilla derives from the name, as a verified Java account's is filed under its profile UUID, so a Java player who played offline before finds a fresh record. Permission, operator and ban entries for an offline name still cover both editions.
