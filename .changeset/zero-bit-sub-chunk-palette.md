---
'@jsprismarine/prismarine': patch
---

A sub chunk made of one block, such as solid stone underground, no longer breaks the packet it is sent in. Since 0.20.0 such a storage was sent with a palette count that the format leaves out at zero bits per block, so the client misread the rest of the sub chunk and disconnected with `ClientDisconnection-90`.
