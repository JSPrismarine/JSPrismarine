---
'@jsprismarine/prismarine': patch
---

A server bound to `0.0.0.0` also listens for RakNet clients on IPv6, on the new `server-portv6` setting (19133 by default, as in Bedrock Dedicated Server), and advertises that port in its server list pong. A server bound to one IPv4 address through `server-ip` stays IPv4 only. When another program holds `server-portv6`, the server starts anyway and logs that IPv6 clients cannot join.
