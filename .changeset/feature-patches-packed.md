---
'@jsprismarine/prismarine': patch
---

Send a feature pass's block writes from the generation workers as typed arrays and a palette instead of one object per block. About 8000 writes per chunk had to be decoded object by object on the server thread when they arrived from the generation host.
