---
'@jsprismarine/prismarine': minor
---

`online-mode` is now on by default, as in Bedrock Dedicated Server. The server checks each player's Xbox account at login and refuses a client that is not signed in. A server whose config leaves `online-mode` unset used to accept any name; set `"online-mode": false` to keep that on a private network.
