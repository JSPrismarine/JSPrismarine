---
'@jsprismarine/prismarine': minor
'@jsprismarine/server': patch
---

Every version surface lists each edition the server speaks through a protocol provider: the startup log and `/version` show Bedrock, Java when `java-enabled` is on, and any edition an embedder passes in the new `protocolProviders` option of `Server`; `--version` prints the version on its first line, then every built-in edition. `@jsprismarine/prismarine/protocolProviders` exports `ProtocolProvider`, the built-in `bedrockProtocolProvider` and `javaProtocolProvider`, and `describeProtocolProviders`, and `Server.getProtocolProviders` returns a server's.

`@jsprismarine/prismarine/network/codec/describeCodecs` and its `describeSupportedProtocols`, which described Bedrock alone, are removed.
