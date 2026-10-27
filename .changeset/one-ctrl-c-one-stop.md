---
'@jsprismarine/server': patch
---

Stop killing the server on a single Ctrl+C under `pnpm run dev`.

`cross-env` forwards the SIGINT it gets from the terminal, so one Ctrl+C reached the host twice, a
millisecond apart. The host took the copy as a second press and killed the server child with
SIGKILL before it saved the world. A signal within 500 ms of the one that started the stop now
counts as part of that stop.
