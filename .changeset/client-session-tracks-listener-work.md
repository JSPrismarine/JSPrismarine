---
'@jsprismarine/client': patch
---

`ClientSession.isIdle` and `settled` now also wait for work a packet listener started and handed to
the new `ClientSession.track`. The login, dimension change and credits listeners use it, so a client
that is still signing its login or deriving its encryption key no longer reports itself idle to a
harness that steps a server between ticks.
