---
'@jsprismarine/server': patch
---

Write the configured `log-level` to the log file as well as the console. The file transport was pinned at `debug`, so `log-level: silly` in `config.yaml` never put the per-packet `Sent`/`Received` lines in `logs/`, and a join that failed on a real client left no record of which packets it had been sent.
