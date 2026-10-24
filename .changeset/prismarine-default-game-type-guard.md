---
'@jsprismarine/prismarine': patch
---

`SetDefaultGameTypeHandler` refuses a value the config cannot hold (such as `Default`,
`WorldDefault`, or a number that is no game type) instead of throwing from
`Config.setGamemode`, and answers a refused request with the default the server has so the
client's world settings screen shows it again. An accepted change is also sent back to every
client, as the protocol docs describe.
