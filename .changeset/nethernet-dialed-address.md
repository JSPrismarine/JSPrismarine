---
'@jsprismarine/nethernet': patch
'@jsprismarine/prismarine': patch
---

A NetherNet server in a container or behind port forwarding takes joins by address without `server-public-ip`. The answer to a join now also offers the address the player typed, read from the signaling request's `Host` header, on the dialed port when NetherNet's UDP port is the signaling port and on the mapped or local port otherwise. Before, such a server offered only its own interface addresses, and the join timed out with `connecterror:15`. A join from a public address that is offered no public address logs a warning that names `server-public-ip`.

`@jsprismarine/nethernet` adds `withDialedCandidates`, `hasPublicCandidate` and `DialedAddress`. `HttpSignaling` passes the dialed address to `sign` as a second argument and takes a `resolve` option for hostnames.
