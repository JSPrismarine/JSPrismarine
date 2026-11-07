---
'@jsprismarine/raknet': patch
---

Resend an unanswered `ClientSocket.ping` every 500 ms until its deadline instead of sending it once, so one dropped datagram no longer fails the ping.
