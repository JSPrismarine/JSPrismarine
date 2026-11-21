# Player inputs are decoded into intents, and one handler per intent runs in the input step

Status: accepted, 2026-11-21. Amends [ADR 0014](0014-handlers-share-a-shape-and-run-in-the-input-step.md).

A serverbound packet that says what a player wants to do is decoded into an intent, and the server handles intents, not packets. An intent is plain data with a `kind`, as [ADR 0013](0013-vetoable-actions-are-staged.md) already uses the word: `PlaceBlock`, `Attack`, `OpenInventory`, `Chat`, `Move`. One table under `packages/prismarine/src/input/` declares every intent, its fields and its lane ([ADR 0009](0009-external-inputs-enter-once-per-tick.md)), and the union type, the dispatcher and the handler registry all derive from that table. An intent handler runs once, whichever edition the packet came from, in the lane the table names, with the context ADR 0014 gives that lane.

Each edition has a decoder per packet. A decoder is a pure function, `decode(packet, view)`, that returns the intents one packet means, where `view` is read-only session state: the player's runtime id, the actors they have been shown, the open window, the game mode. A check that needs only the view belongs in the decoder, such as "the inventory open names the sender" or "the target is within reach". A check that needs the world belongs in the intent handler. A decoder writes nothing and sends nothing.

Connection-lane ceremony stays as per-edition handlers with no intent: network settings, login, the encryption handshake and resource packs on Bedrock; the handshake, status, login and configuration phases on Java. These are protocol conversations with no game meaning, and ADR 0014's shared handler shape still describes them.

A plugin registers at either level. A raw packet handler, per edition and by packet name, merges with the built-in decoder the way `appendHandler` merges handlers today. An intent handler, by kind, runs behavior once for both editions. A plugin that wants behavior writes the second kind; one that needs the bytes writes the first.

## Considered options

Keeping one handler per packet per edition, each calling the same `PlayerSession` methods, is what the Bedrock handlers half-do today, and it is the cheapest first step. It was rejected because every behavior would then live twice, once per edition, and the two copies would drift with every fix.

Translating Java packets into Bedrock packets before the existing handlers was rejected in [ADR 0026](0026-java-is-a-second-protocol-family-over-one-world.md): a Java input Bedrock has no packet for cannot be translated.

## Consequences

Movement has one intent. `Move` carries the claimed position, rotation, on-ground flag and, when the edition sends them, the input bits and client tick. One validator checks it, with the tolerance keyed by edition, and each presenter issues its own correction: Bedrock a prediction correction, Java a position synchronization with a teleport id.

The 74 Bedrock handlers migrate in groups, and each group's pull request keeps the Bedrock client e2e suite green. A handler whose work is all validation and one session call becomes a decoder and an intent handler of a few lines each. The replay trace can later record intents instead of packets, which would make a replay independent of the edition that produced it.
