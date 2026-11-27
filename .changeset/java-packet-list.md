
`@jsprismarine/protocol/java/javaIdentity` gives `offlineUuid`, the UUID an offline-mode server gives a name, and `serverHash`, the hash a client and a server each send Mojang's session server, so both ends of a Java login compute them in one place.

`brandOf` in `@jsprismarine/protocol/java/packet/configuration` reads a `minecraft:brand` payload, as `brandPayload` writes it.
