---
'@jsprismarine/nethernet': minor
'@jsprismarine/prismarine': minor
---

`server-udp-ports` follows Bedrock Dedicated Server 1.26.70.24, and the new `server-public-ip` names the address NetherNet advertises. A single port now serves every player, a range spreads players over its ports by the fewest players and reuses them once all are in use, and commas join entries whose local ports form one continuous range. Mappings and `server-public-ip` add server-reflexive candidates to each answer as BDS does, and a deprecated `IP:public:local` prefix still works with a warning. A value BDS refuses stops the start with BDS's message; a config whose local ranges have a gap, which used to start, is now refused.

`@jsprismarine/nethernet` adds `PortAllocator`, the `PortSelectionStrategy` interface with `fewestPeers`, `parsePublicIp` and `UdpPortsError`. `parseUdpPorts` takes `server-public-ip` and returns its address and warnings, `PortMapping` no longer carries an address, and `withMappedCandidates` takes the public address. `NetherNetServer` takes `ports`.
