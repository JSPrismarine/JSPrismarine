---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

A Java Edition player places blocks and uses items on blocks: Java's `Use Item On` decodes into a new `useItemOnBlock` intent, whose handler offers the click to the content path a Bedrock click goes through. `@jsprismarine/protocol` gains Java's `Use Item On` packet and `JavaHand`.
