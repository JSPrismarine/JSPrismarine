---
'@jsprismarine/prismarine': patch
---

Apply a feature patch that arrived from a generation worker as the worker packed it. Its block writes stay in typed arrays with a palette of the distinct blocks, instead of becoming one object per write on the server thread.
