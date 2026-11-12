---
'@jsprismarine/nethernet': patch
'@jsprismarine/prismarine': patch
---

A NetherNet server with `server-public-ip` empty now looks up its public address when it starts. It asks the web services in `PUBLIC_IP_SERVICES` in turn, stops at the first that answers, and logs the address. A join whose answer would otherwise carry no public address is offered that one. When every service fails, the server logs a warning that names each failure and `server-public-ip`. The new `enable-server-public-ip-lookup` setting turns the lookup off, and with it off the server answers joins as it did before. A server bound to a loopback address does not look anything up.

`@jsprismarine/nethernet` adds `lookupPublicIp`, `PUBLIC_IP_SERVICES`, `PublicIpLookupOptions` and `PublicIpLookupResult`, and `withAdvertisedCandidates`, which adds the mapped, public and dialed candidates to an answer and falls back to a given public address when none of them is public.
