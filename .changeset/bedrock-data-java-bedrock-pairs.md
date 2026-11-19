---
'@jsprismarine/bedrock-data': patch
---

`@jsprismarine/bedrock-data/sources` exports `javaBedrockPairs` and `javaBedrockPair`, which derive the (Java release, Bedrock protocol) pairs from `sources.json`: the default Java release with the default protocol, and a Java preview with the Bedrock preview, or with the default protocol when no Bedrock preview is pinned. Any other pinned Java release pairs with the protocol its entry declares in `bedrockProtocol`, and loading the manifest fails when such an entry lacks one or names a protocol `bds` does not pin.
