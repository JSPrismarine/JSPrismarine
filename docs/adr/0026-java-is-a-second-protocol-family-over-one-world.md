# Java Edition is a second protocol family over one world

Status: accepted, 2026-11-21

A Java Edition client joins the same server and the same world as a Bedrock client. The world keeps its model as it is: blocks, items and entity types come from the pinned Bedrock Dedicated Server ([ADR 0019](0019-bedrock-data-comes-from-bds.md)), gameplay data from the Java datapack, and one simulation serves every session. Java is a second protocol family beside Bedrock, with its own transport, codecs, decoders and presenter, and nothing else in the server knows which edition a player arrived from.

Both families live in `@jsprismarine/protocol`. The edition-neutral parts stay at the package root: `NetworkPacket`, `NetworkBinaryStream`, the wire-layout definitions ([ADR 0003](0003-declarative-wire-layouts.md)), `ProtocolCodec`, the handler shape and the lanes. Each edition has its own directory, `bedrock/` and `java/`, holding its packets, structures, layouts and per-version tables. Neither edition is the package's default, so every import names its edition.

Each edition keeps its own release train and gets its own window ([ADR 0025](0025-older-protocols-are-a-window-relative-to-the-newest-release.md)): `bedrock-protocol-window` and `java-protocol-window`, each counted back from that edition's newest supported release. `protocol-content` stays one setting. `newest` keeps the newest Bedrock release's content in the world, and a session that cannot express a block, item or entity gets a substitute from the mapping's loss list, which the server logs at startup. `oldest` sets the content floor to what every accepted release of both editions has, so no session sees a substitute.

The content a Java client sees goes through `@jsprismarine/mapping` in the inverse direction from today. The world stores Bedrock block states, and the inverse is lossy, so the package derives one canonical Java state per Bedrock state from its forward table and records the remainder in the loss list.

## Considered options

A Java-shaped world model with Bedrock as the translated view is what GeyserMC does, and [the translation note](../research/java-to-bedrock-translation.md) shows it works. It was rejected because every data table in this repository is keyed by the pinned Bedrock release, and ADR 0019 pins one default. Re-keying them for a second client type would redo the data pipeline to serve a presentation.

A separate package for Java packets, or a neutral core package with one package per edition, was rejected. The two editions share the codec, layout and handler machinery, and a Java package depending on a package named for Bedrock misstates the dependency. The published package's import paths change once, in one release.

Translating Java packets into Bedrock packets at the connection, as ViaBedrock does in the other direction, was rejected because Java inputs that Bedrock has no packet for, such as an off-hand swap or a left click distinct from a right click, would have nowhere to go. [ADR 0027](0027-player-inputs-are-decoded-into-intents.md) is where the two editions meet instead.

## Consequences

Light reaches a Java player. The lighting package's arrays, which no Bedrock packet carries, go into the Java chunk packet.

A world may hold content a Java client cannot show, and with `protocol-content: newest` that is by design. The startup log names the substitutes so an owner can choose `oldest` instead.

Player identity is not this decision's. [The permissions plan](https://github.com/JSPrismarine/JSPrismarine/pull/3377) defines a `Subject` with an `xbox`, a `java` and an `offline` kind, and the Java login is the first producer of the `java` kind.

Chat signing is not implemented. The server accepts unsigned chat and sends chat as system messages, which a vanilla client shows without verifying anything. There is no plan to add signing.
