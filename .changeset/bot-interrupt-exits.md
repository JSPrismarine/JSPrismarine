---
'@jsprismarine/client': patch
---

`jsp-client bot` exits once it prints its report after SIGINT or SIGTERM, instead of waiting out its `--duration`. An interrupt during the ramp now stops the remaining bots from connecting and prints the report too, and a second signal after the run ends the process as usual.
