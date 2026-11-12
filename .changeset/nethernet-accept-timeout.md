---
'@jsprismarine/nethernet': patch
---

`NetherNetServer` waits 10 seconds for a peer to open after its answer, up from 5. That is the default EndstoneMC's NetherNet specification gives for Bedrock's negotiation timeout, and it leaves a player time to answer the prompt to trust the server.
