# Packet handlers share one shape in both directions, and serverbound handlers run in the input step

Status: accepted

Packet handlers register by packet name and session phase, in one shape defined in `@jsprismarine/protocol` that the server and the client package both use. Each side supplies its own context type and keeps its own execution contract.

A serverbound handler declares its lane ([ADR 0009](0009-external-inputs-enter-once-per-tick.md)), and what follows describes the input lane. Connection-lane and read-lane handlers run when their packet arrives and may stay asynchronous.

An input-lane handler for a player who is in a world takes a narrow context and not `Server`. It runs synchronously in that world's input step ([ADR 0009](0009-external-inputs-enter-once-per-tick.md)) against loaded chunks only. Sends become outputs. An interaction with a chunk that is not loaded is rejected, as `BlockTarget` already does, and a synchronous accessor for loaded blocks replaces `getBlock` where a handler needs a `Block`. Work that needs I/O runs in the connection layer before the player joins a world: login, authentication, loading the player record and reading the operator list. Its result enters the world as a recorded input. Changing the operator list updates memory synchronously and persists off the tick.

The client has no world tick, so its handlers may stay asynchronous.

Today a handler takes the whole `Server`, can run between the awaits of `World.update`, and awaits its own sends. The client package rebuilt packet dispatch in `ClientPacketRegistry` because the server's handler shape cannot serve it. Most server handlers await nothing but sends, so most convert without changing behavior. The few that read chunks have synchronous equivalents on `World`, and the I/O handlers belong to the connection phase, not the simulation.
