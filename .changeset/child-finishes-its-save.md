---
'@jsprismarine/server': patch
---

Let the server child finish its world save after the host asks it to stop.

`ServerChild.stop` sent SIGTERM one second after the `shutdown` message. A server hands its
termination signals back to the kernel when its shutdown starts, so that SIGTERM ended any save
that took longer than a second. A child that has reported `lifecycle stopping` now gets no SIGTERM,
only the kill grace period before SIGKILL.
