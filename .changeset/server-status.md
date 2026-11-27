---
'@jsprismarine/prismarine': patch
---

Every transport advertises one server status. `Server.getServerStatus()` returns a `ServerStatus` that holds the MOTD, the second name and the player counts, and RakNet's pong, NetherNet's join status and LAN advertisement, the query protocol and Java Edition's status response all read it. An owner layers changes over what the server says with `override(owner, fields)` and takes them back with `clear(owner)`; where two owners change one field, the one that changed it last shows. The status exists before the server listens, so a change made while the server loads shows on the first ping. `Networking.getServerStatus()` is new, and `netherNetStatusOf` and `advertiseOnLan` take the status instead of RakNet's server name.
