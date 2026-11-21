---
'@jsprismarine/native-network': patch
---

A connectivity check's error response with code 401, 420 or 500 no longer fails the candidate pair. Bedrock Dedicated Server answers a check from more than one of its agents, with a success and then a 401, and that 401 dropped NetherNet clients a few seconds after they joined it.
