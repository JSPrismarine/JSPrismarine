---
'@jsprismarine/prismarine': patch
---

A login that replaces a connected player of the same account now removes that player as an input, behind the inputs its client sent first. It used to remove the player at once, so the next input step dropped those inputs and the saved record the new login read was missing them.
