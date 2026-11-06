---
'@jsprismarine/prismarine': patch
---

Make `/kill` remove a dropped item stack. It only set the stack's health to zero, so it stayed in the world and on every client's screen until a second `/kill`.
