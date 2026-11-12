---
'@jsprismarine/nethernet': patch
'@jsprismarine/prismarine': patch
---

A NetherNet join's candidates, answer, connection states and opened peer are logged at debug instead of info, so a server at the default log level shows a join only when it fails. A peer that ends before it connects is logged at warn. `tracePeerConnection` passes its callback a second argument that marks such a line.
