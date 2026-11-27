---
'@jsprismarine/script-host': patch
---

Implement the data-driven `@minecraft/server-ui` API: `CustomForm`, `MessageBox`, the four `Observable*` classes and their form controls. `show()` hands the world the form as the `minecraft` data store property the pinned BDS sends, a bound observable's `setData()` updates one path of it, a client's write to a path runs a button's callback or sets a client-writable observable, and `show()` settles once the client reports the screen closed, or rejects when the player leaves.
