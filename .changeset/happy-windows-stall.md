---
"@jsprismarine/raknet": patch
---

Run RakNet session maintenance after the event loop has polled pending datagrams to avoid retransmitting acknowledged frames or timing out active peers after stalls.
