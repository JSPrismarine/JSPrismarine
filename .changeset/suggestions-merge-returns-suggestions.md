---
'@jsprismarine/brigadier': patch
---

`Suggestions.merge` now returns `Suggestions` rather than `Suggestions | undefined`. The one-list
case read position zero off the input array, which `noUncheckedIndexedAccess` types as possibly
absent even though the length had just been checked, so every caller had to handle a result the
method cannot produce. It destructures the input instead, which says the same thing in a form the
compiler can follow.
