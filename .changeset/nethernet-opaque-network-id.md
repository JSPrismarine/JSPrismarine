---
'@jsprismarine/nethernet': patch
---

`HttpSignaling` takes any network ID of up to 128 characters in `POST /v1/join/{networkId}`, as Mojang's guide asks: the ID is an opaque string whose format may change. It used to answer 400 to anything but an unsigned 64-bit integer. The offer it hands to `handleOffer` no longer carries a `networkId`.
