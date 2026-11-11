---
'@jsprismarine/client': patch
'@jsprismarine/nethernet': patch
---

`jsp-client --latency` and `--loss` work over NetherNet again. With either set, the client joins through a relay: its WebRTC binds to `127.0.0.1` and offers no candidates, and each of the server's candidates is rewritten to a loopback socket the relay forwards from, so every datagram crosses a Node.js socket the link conditions reach. Without them the client connects directly. `@jsprismarine/nethernet` adds `withoutCandidates` and `withRewrittenCandidates`.
