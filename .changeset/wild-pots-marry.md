---
'@jsprismarine/prismarine': patch
---

Expose the module kernel as the supported service API and finish the phase 6 server extractions.

- `Server.getKernel()` returns the kernel; the package index now exports the service token barrel
  (`bansToken`, `permissionsToken`, `recipesToken`, `stationsToken`, `chatToken`, `queryToken`,
  `tickerToken`, `networkToken`) plus `Kernel`, `createToken`, and the `Module`/`ModuleContext`/
  `ServiceToken` types.
- The kernel-backed `getXxxManager()` getters are deprecated in favor of
  `server.getKernel().get(token)`. They keep working unchanged.
- RakNet listener wiring moved into a `prismarine:network` module providing a `Networking` service;
  startup and shutdown ordering are unchanged, as is `Server.bootstrap(ip, port)`.
