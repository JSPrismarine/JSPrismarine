---
'@jsprismarine/script-host': patch
---

Implement the data-driven `@minecraft/server-ui` API: `CustomForm`, `MessageBox`, the four `Observable*` classes and their form controls. Builders keep controls in order, observables notify subscribers and accept client writes through a form channel, button callbacks run while a screen is open, and `show()` settles with the close reason or rejects when the player leaves.
