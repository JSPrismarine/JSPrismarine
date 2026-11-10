---
"@jsprismarine/prismarine": patch
---

`Server` takes an optional `transport`, which it listens on instead of the transports the config enables, such as an in-process loopback a test harness drives. It then binds no RakNet, NetherNet or query socket.
