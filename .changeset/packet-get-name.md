---
'@jsprismarine/protocol': minor
'@jsprismarine/client': patch
---

`NetworkPacket.getName()` is abstract, and every packet class returns its own name from it instead of the base class reading `this.constructor.name`. A packet class defined outside `@jsprismarine/protocol` must now implement `getName()`, returning the class name that keys its wire id in the packet tables, such as `'ShowCreditsPacket'`. `FieldNetworkPacket` is abstract too. `nbtToPlain` recognizes tag classes with `instanceof` rather than by their constructor.
