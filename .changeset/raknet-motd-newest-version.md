---
'@jsprismarine/raknet': patch
---

`ServerName` advertises the last entry of `getIdentifiers().MinecraftVersions` in the MOTD line instead of the first, so a server supporting 1.26.50 and 1.26.51 shows up as 1.26.51, the way a Bedrock Dedicated Server of that version does.
