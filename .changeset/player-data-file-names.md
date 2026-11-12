---
'@jsprismarine/prismarine': patch
---

A world without player storage in its provider files each player's JSON record under a name that cannot leave its `playerdata` folder. An offline player's key is the display name the client chose, and a name such as `../../config` used to read and write a file outside the folder. Separators, the characters Windows refuses in a file name, `%` and control characters are now written as `%` and their code in hex, and the path is checked to stay in the folder. XUIDs and ordinary gamertags keep the file names they had, and a record under a name from before is still read and moves to its new name on the next save.
