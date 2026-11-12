---
'@jsprismarine/prismarine': minor
---

`port` is now `server-port`, as Bedrock Dedicated Server names it. A `config.json` with `port` has it renamed when the server loads it, keeping its value and comments; a file with both is refused, naming them.

A fresh config writes `server-port` and `server-portv6`, and leaves `server-udp-ports` and `query-port` out; reading those no longer writes them. Unset, each follows `server-port`: query answers on it, and NetherNet's UDP shares it with RakNet. A config with an empty `server-udp-ports` moves NetherNet's UDP from ports the system picked to `server-port`. `server-portv6` keeps its default of 19133, where Bedrock clients look for a server's IPv6 listener. `Config` adds `getQueryPortSetting`.
