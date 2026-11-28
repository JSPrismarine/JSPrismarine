---
'@jsprismarine/prismarine': patch
'@jsprismarine/java-packs': patch
'@jsprismarine/client': patch
---

Java Edition players get the installed addons' resource packs, converted into one Java resource pack. The server converts the packs once each time they change, keeps the result in `cache/java-packs/`, serves it from its own Java port by its SHA-1, and pushes it as a client configures; `texturepack-required` makes declining it end the join. A player in play gets a new pack when the addons change, and keeps the old one until the new one loaded. The new `java-resource-pack-url` setting serves the packs from a base URL instead, and the server offers a pack there once that URL serves it. `@jsprismarine/java-packs` exports `JAVA_PACK_CONVERTER_VERSION`. `@jsprismarine/client`'s `JavaClient` downloads, checks and loads a pushed pack, or declines it with `resourcePacks: 'decline'`.
