# Older protocols are a window relative to the newest release

Status: accepted, 2026-11-18

A server accepts the newest release this build supports and, when its owner asks, the releases just before it. Two settings decide the policy, and neither names a version. `protocol-window` is how many releases to accept, counted back from the newest. `protocol-content` is which of them the world's content comes from: `newest`, or `oldest` for the oldest release in the window. The defaults are a window of 1 and `newest`, which is what a Bedrock Dedicated Server does. A server upgrade moves the window forward with no config change. A minigames server that sets a window of 3 and `oldest` keeps three releases of players and never puts a block, item or mob into the world that one of them lacks. A preview is negotiated with a client that announces it, outside the window, as before.

Two kinds of difference separate releases, and only one of them is a policy question. Content an older client has, written differently, is translated whatever the settings say. 1.26.60 gave fire, redstone wire and chorus plants connection states, so all 1872 of their states hash to runtime ids a 1.26.51 client does not know, and it moved 82 item ids. A session gets each block state projected onto its own version's catalog and re-hashed, derived from the two captured palettes, as Geyser's `ICanHasMoreStates` does for the same three blocks. Content an older client does not have at all, such as 1.26.60's icicle, frostbite spawn egg and `ice_ball`, is kept out of the world by `protocol-content: oldest`. The content build leaves out every vanilla block, item and entity type the content release's capture lacks, so commands, the creative menu and packs refuse them as unknown. With `newest` and a wider window, an older session is sent `minecraft:info_update` for a missing block or item and is not sent a missing actor. The server logs which content that affects when it starts.

## Considered options

A list of accepted versions, such as `"accept": ["1.26.51", "1.26.60"]`, was rejected because every upgrade would need the owner to edit it, and a server left alone would keep refusing the new release's players.

Translating everything for every session, with no setting, was rejected. A survival server wants the new release's blocks and mobs, and showing them to older players as `info_update` misrepresents the world. The research note [cross-version-bedrock-data.md](../research/cross-version-bedrock-data.md) recommended it before this decision.

Running the world on the oldest release's data, with its catalog, mapping and item tables, would keep new content out without a gate. It would need every data table to load per version, against [ADR 0019](0019-bedrock-data-comes-from-bds.md)'s single pinned default, and the new release's re-encoded states would then need translating upward for newer clients. Gating the content build reaches the same world with the newest data.

## Consequences

The window is server-wide. A client's first packet names its protocol, and the server accepts or refuses it before any world is chosen. A per-world `protocol-content` that can only narrow the server's setting, for a lobby beside a survival world, fits the same keys later. It would need a refusal when a player moves into a world outside their window, and a substitute for an item carried between worlds.

Widening the window on a server with `oldest` content moves the content floor back. Content already in the world that the new floor lacks then reaches older sessions as substitutes, which the startup log names. Narrowing the window or upgrading the server only moves the floor forward, so nothing in the world becomes unknown.

A window wider than the codecs a build ships is clamped to them, with a log line, so a newer build that drops an old codec never stops a server from starting.
