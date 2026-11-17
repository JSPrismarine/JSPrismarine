---
'@jsprismarine/entities': patch
---

The `hourly_clock_time` filter compares the time of day to the tick, as the vanilla pack's creaking writes it with 23400 and 12600, where it was rounded down to the hour and its `>` and `<=` tests were off by up to an hour.
