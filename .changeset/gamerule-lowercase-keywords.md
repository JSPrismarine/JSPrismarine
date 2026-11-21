---
'@jsprismarine/commands': patch
---

The command packet leaves out any keyword with an uppercase letter, such as `/gamerule`'s pre-1.21.11 `doDaylightCycle`. A Bedrock client refused each one and logged "Keywords in commands need to be lower case". The server still accepts those names when a player types them, and each one adds an `uppercase-keyword` note to the flatten result.
