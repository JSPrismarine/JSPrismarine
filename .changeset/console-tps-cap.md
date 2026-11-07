---
'@jsprismarine/console': patch
---

The console never shows more than 20 TPS. A loop catching up on lost ticks reports a rate above 20, which the status bar, the details pane, and the TPS page showed as 20.84 or more and which stretched the TPS page's axis past 20. Every view now caps the reading at 20.
