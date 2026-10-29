---
'@jsprismarine/prismarine': patch
---

Move the server tick loop into a `prismarine:ticker` kernel module that publishes a `Ticker`
service token. The loop itself is unchanged — fixed-epoch scheduling, the sliding-window TPS and
smoothed tick-duration metrics, the two-second catch-up write-off, and the shutdown interaction all
move verbatim — and `Server.getTick()`, `getTPS()`, and `getTickMs()` keep working as facades over
the ticker. The module starts the loop on kernel start and stops it on kernel stop, so ticking now
pauses across `Server.reload()` and resumes on a fresh scheduling epoch instead of repaying the
downtime as a catch-up burst.
