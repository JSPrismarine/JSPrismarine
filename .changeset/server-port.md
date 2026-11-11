---
'@jsprismarine/prismarine': minor
---

`port` is now `server-port`, as Bedrock Dedicated Server names it. A `config.json` with `port` has it renamed when the server loads it, keeping its value and comments; a file with both is refused, naming them.

A fresh config writes `server-port` and leaves `server-portv6`, `server-udp-ports` and `query-port` out, and reading them no longer writes them. Unset, each follows `server-port`: RakNet's IPv6 listener and query answer on it, and NetherNet's UDP shares it with RakNet, so the defaults need one port number open for UDP and TCP. A config with an empty `server-udp-ports` moves NetherNet's UDP from ports the system picked to `server-port`. A config that names `server-portv6: 19133` keeps it. `Config` adds `getServerPortV6Setting` and `getQueryPortSetting`.
