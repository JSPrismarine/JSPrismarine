---
'@jsprismarine/prismarine': patch
---

`ResourcePackClientResponseHandler` answers every status a client can send. A player that
refuses the packs, or asks the server to send packs it never offered, is disconnected with
the resource pack reason instead of being left on the loading screen until the connection
times out. A repeated `Completed` no longer starts the join again, which used to announce
the player to everyone a second time, and a repeated `HaveAllPacks` after the join started
no longer sends a second pack stack. A status outside the four is logged and dropped.
