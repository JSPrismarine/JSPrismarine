---
title: '@jsprismarine/prismarine network errors'
description: The code, message and meaning of every error in the network catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine network errors

These are the errors in the `network` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.network -->
## `PRISMARINE_ANVIL_DAMAGE_NOT_DECODED`

`Cannot handle an AnvilDamagePacket without decoded data`

Thrown as `PrismarineNetworkErrors.AnvilDamageNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_BLOCK_PICK_REQUEST_NOT_DECODED`

`Cannot handle a BlockPickRequestPacket without decoded data`

Thrown as `PrismarineNetworkErrors.BlockPickRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_BOOK_EDIT_NOT_DECODED`

`BookEditPacket has no payload after validation`

Thrown as `PrismarineNetworkErrors.BookEditNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_BUFFER_COUNT_MISMATCH`

`Packet and buffer counts differ: {packetsCount} packets, {packetBuffersCount} buffers`

Thrown as `PrismarineNetworkErrors.BufferCountMismatch`, which extends `RangeError`.

A batch was encoded with a different number of packets and buffers. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_CHUNK_RADIUS_REQUEST_NOT_DECODED`

`RequestChunkRadiusPacket has no payload`

Thrown as `PrismarineNetworkErrors.ChunkRadiusRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_CHUNK_TOO_LARGE_FOR_QUEUE`

`Chunk payload {memoryBytes} exceeds the {queuedChunkBytesLimit}-byte queue limit`

Thrown as `PrismarineNetworkErrors.ChunkTooLargeForQueue`, which extends `RangeError`.

One chunk is larger than a player's whole send queue, so it could never be sent. This is a
bug in the server; report it with the stack trace.

## `PRISMARINE_COMMAND_BLOCK_UPDATE_NOT_DECODED`

`Cannot handle a CommandBlockUpdatePacket without decoded data`

Thrown as `PrismarineNetworkErrors.CommandBlockUpdateNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_COMMAND_REQUEST_NOT_DECODED`

`CommandRequestPacket has no decoded payload`

Thrown as `PrismarineNetworkErrors.CommandRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_COMPRESSION_CHANGED_DURING_FLUSH`

`Outbound packet compression changed while a queue flush was pending`

Thrown as `PrismarineNetworkErrors.CompressionChangedDuringFlush`, which extends `Error`.

A connection's compression changed while packets were waiting to be sent under the old
settings. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_CONTENT_PALETTE_MISMATCH`

`the content block palette disagrees with the client's in {count} place(s), first: {block} {detail}`

Thrown as `PrismarineNetworkErrors.ContentPaletteMismatch`, which extends `Error`.

The block palette the server's content builds differs from the one the client expects, so
players would see the wrong blocks. The error's `disagreements` list every difference; a pack
that changes vanilla blocks is the usual cause.

## `PRISMARINE_DIMENSION_WITHOUT_TYPE`

`Level {name} announces dimension {dimensionType} without a type`

Thrown as `PrismarineNetworkErrors.DimensionWithoutType`, which extends `Error`.

A world lists a dimension without its dimension type, so the client cannot be told about it.
The world's dimension config is incomplete.

## `PRISMARINE_DISCONNECT_NOT_DECODED`

`DisconnectPacket has no payload`

Thrown as `PrismarineNetworkErrors.DisconnectNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_DISCRIMINATOR_COUNT_MISMATCH`

`Packet and fragment-discriminator counts differ: {buffersCount} packets, {discriminatorsCount} discriminators`

Thrown as `PrismarineNetworkErrors.DiscriminatorCountMismatch`, which extends `RangeError`.

A batch was encoded with a different number of packets and fragment discriminators. This is a
bug in the server; report it with the stack trace.

## `PRISMARINE_DUMP_FOLDER_OWNED_BY_OTHER_USER`

`{directory} belongs to another user`

Thrown as `PrismarineNetworkErrors.DumpFolderOwnedByOtherUser`, which extends `Error`.

The folder the server writes packet dumps to belongs to another user, so the server refuses
to write there. Use a folder you own.

## `PRISMARINE_DUMP_FOLDER_WRITABLE_BY_OTHERS`

`{directory} can be written by other users`

Thrown as `PrismarineNetworkErrors.DumpFolderWritableByOthers`, which extends `Error`.

The folder the server writes packet dumps to can be written by other users, so the server
refuses to write there. Remove the group and world write permission, or use another folder.

## `PRISMARINE_DUMP_PATH_NOT_FOLDER`

`{directory} is not a directory, or is a symbolic link`

Thrown as `PrismarineNetworkErrors.DumpPathNotFolder`, which extends `Error`.

The packet dump path is not a folder, or is a symbolic link, which the server refuses so
dumps cannot land elsewhere. Point it at a real folder.

## `PRISMARINE_DUPLICATE_HANDLER`

`Handler for {packetName} already exists!`

Thrown as `PrismarineNetworkErrors.DuplicateHandler`, which extends `Error`.

Two handlers were registered for the same packet.

## `PRISMARINE_EMOTE_LIST_NOT_DECODED`

`Cannot handle an EmoteListPacket without decoded data`

Thrown as `PrismarineNetworkErrors.EmoteListNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_EMPTY_BLOCK_CHANGE_BATCH`

`A block-change batch has no packet to report`

Thrown as `PrismarineNetworkErrors.EmptyBlockChangeBatch`, which extends `Error`.

A batch of block changes failed to send and had no packet to name in the report. This is a
bug in the server; report it with the stack trace.

## `PRISMARINE_EMPTY_BLOCK_CHANGE_SUB_CHUNK`

`A block-change subchunk cannot be empty`

Thrown as `PrismarineNetworkErrors.EmptyBlockChangeSubChunk`, which extends `Error`.

A block change batch was built for a sub-chunk with no changes. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_EMPTY_MESSAGE`

`A message is required`

Thrown as `PrismarineNetworkErrors.EmptyMessage`, which extends `Error`.

A message was sent to a player with no text.

## `PRISMARINE_EMPTY_MOVEMENT_BATCH`

`A movement batch has no packet to report`

Thrown as `PrismarineNetworkErrors.EmptyMovementBatch`, which extends `Error`.

A batch of entity movement failed to send and had no packet to name in the report. This is a
bug in the server; report it with the stack trace.

## `PRISMARINE_EMPTY_PACKET_ENCODING`

`Packet encoding returned no bytes`

Thrown as `PrismarineNetworkErrors.EmptyPacketEncoding`, which extends `Error`.

A packet encoded to nothing. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_EMPTY_SHARED_BATCH`

`A large shared batch has no packet to report`

Thrown as `PrismarineNetworkErrors.EmptySharedBatch`, which extends `Error`.

A large shared batch failed to send and had no packet to name in the report. This is a bug in
the server; report it with the stack trace.

## `PRISMARINE_FRAGMENT_KEY_COUNT_MISMATCH`

`Packet and fragment-key counts differ: {buffersCount} packets, {keysCount} keys`

Thrown as `PrismarineNetworkErrors.FragmentKeyCountMismatch`, which extends `RangeError`.

A batch was encoded with a different number of packets and fragment keys. This is a bug in
the server; report it with the stack trace.

## `PRISMARINE_FRAGMENT_WITHOUT_CODEC_KEY`

`Full-flush fragments require a protocol codec cache key`

Thrown as `PrismarineNetworkErrors.FragmentWithoutCodecKey`, which extends `Error`.

A shared batch was encoded without the protocol key its cached fragments are filed under.
This is a bug in the server; report it with the stack trace.

## `PRISMARINE_FRAME_TOO_LARGE_FOR_NETHERNET`

`A {byteLength} byte frame exceeds NetherNet's message limit`

Thrown as `PrismarineNetworkErrors.FrameTooLargeForNethernet`, which extends `RangeError`.

The server tried to send a batch larger than one NetherNet message can carry. This is a bug
in the server; report it with the stack trace.

## `PRISMARINE_FURNACE_OPTIONS_NOT_DECODED`

`Cannot handle a SetPlayerFurnaceOptionsPacket without decoded data`

Thrown as `PrismarineNetworkErrors.FurnaceOptionsNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_INVALID_CHUNK_CACHE_LIMIT`

`Chunk batch cache limit must be a non-negative integer, got {maxBytes}`

Thrown as `PrismarineNetworkErrors.InvalidChunkCacheLimit`, which extends `RangeError`.

The chunk batch cache was given a size limit that is not a whole, non-negative number of
bytes.

## `PRISMARINE_INVALID_CLIENT_IDENTITY_KEY`

`The client identity key is not a {bedrockCurve} public key`

Thrown as `PrismarineNetworkErrors.InvalidClientIdentityKey`, which extends `Error`.

The key a client's login names is not on the curve Bedrock uses, so encryption cannot be set
up with it. The client is modified or broken.

## `PRISMARINE_INVALID_REPLAY_MANIFEST`

`Invalid replay initial-state manifest`

Thrown as `PrismarineNetworkErrors.InvalidReplayManifest`, which extends `TypeError`.

A replay's starting-state manifest does not have the shape the server writes, so it cannot be
saved. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_INVALID_TRACE_RECORD`

`Invalid inbound packet trace record`

Thrown as `PrismarineNetworkErrors.InvalidTraceRecord`, which extends `Error`.

A packet trace holds a record of the wrong shape, so it is damaged.

## `PRISMARINE_INVALID_TRACE_RECORDS`

`Invalid inbound packet trace records`

Thrown as `PrismarineNetworkErrors.InvalidTraceRecords`, which extends `Error`.

A packet trace's records are not a list, so it is damaged.

## `PRISMARINE_JAVA_VERIFY_TOKEN_MISMATCH`

`The encryption response does not carry the token the server sent`

Thrown as `PrismarineNetworkErrors.JavaVerifyTokenMismatch`, which extends `Error`.

A Java Edition client's encryption response did not decrypt to the token the server sent, so
it did not encrypt it with the server's key. The server refuses the join.

## `PRISMARINE_LAB_TABLE_NOT_DECODED`

`Cannot handle a LabTablePacket without decoded data`

Thrown as `PrismarineNetworkErrors.LabTableNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_LECTERN_UPDATE_NOT_DECODED`

`Cannot handle a LecternUpdatePacket without decoded data`

Thrown as `PrismarineNetworkErrors.LecternUpdateNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_LOADING_SCREEN_NOT_DECODED`

`Cannot handle a ServerboundLoadingScreenPacket without a payload`

Thrown as `PrismarineNetworkErrors.LoadingScreenNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_LOGIN_NOT_DECODED`

`Cannot handle LoginPacket without packet data`

Thrown as `PrismarineNetworkErrors.LoginNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_LOGIN_TOKEN_IS_NOT_JWT`

`The login token is not a JWT`

Thrown as `PrismarineNetworkErrors.LoginTokenIsNotJwt`, which extends `Error`.

A client's login holds a token that is not a JSON web token, so the client is modified or
broken.

## `PRISMARINE_MISSING_BLOCK_CHANGE`

`Missing block change at flush index {index}`

Thrown as `PrismarineNetworkErrors.MissingBlockChange`, which extends `Error`.

Sending block changes lost track of a change. This is a bug in the server; report it with the
stack trace.

## `PRISMARINE_MISSING_ENCODED_BLOCK_PACKET`

`Missing encoded block packet`

Thrown as `PrismarineNetworkErrors.MissingEncodedBlockPacket`, which extends `Error`.

Sending block changes lost an encoded packet. This is a bug in the server; report it with the
stack trace.

## `PRISMARINE_MISSING_ENCODED_MOVEMENT`

`Missing encoded movement for runtime id {runtimeId}`

Thrown as `PrismarineNetworkErrors.MissingEncodedMovement`, which extends `Error`.

Sending entity movement lost an entity's packet. This is a bug in the server; report it with
the stack trace.

## `PRISMARINE_MISSING_MOVEMENT_BYTES`

`Missing movement bytes for runtime id {runtimeId}`

Thrown as `PrismarineNetworkErrors.MissingMovementBytes`, which extends `Error`.

Sending entity movement lost an entity's encoded bytes. This is a bug in the server; report
it with the stack trace.

## `PRISMARINE_MOVEMENT_PREDICTION_SYNC_NOT_DECODED`

`Cannot handle a ClientMovementPredictionSyncPacket without decoded data`

Thrown as `PrismarineNetworkErrors.MovementPredictionSyncNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_NETHERNET_FRAME_NOT_BATCH`

`A NetherNet frame must be a batch, got id 0x{payload}`

Thrown as `PrismarineNetworkErrors.NethernetFrameNotBatch`, which extends `Error`.

A NetherNet client sent a frame that is not a packet batch, so the client is modified or
speaks another protocol.

## `PRISMARINE_NETWORK_SETTINGS_REQUEST_NOT_DECODED`

`RequestNetworkSettingsPacket has no payload`

Thrown as `PrismarineNetworkErrors.NetworkSettingsRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_NO_HANDLER`

`Invalid handler for packet {packetName}!`

Thrown as `PrismarineNetworkErrors.NoHandler`, which extends `Error`.

Code asked for the handler of a packet that has none.

## `PRISMARINE_NO_INPUT_LANE_HANDLER`

`{name} has no input-lane handler`

Thrown as `PrismarineNetworkErrors.NoInputLaneHandler`, which extends `Error`.

A packet that must be handled during the world tick has no handler there. This is a bug in
the server; report it with the stack trace.

## `PRISMARINE_NOT_RAKNET_CONNECTION`

`Connection {id} did not connect over RakNet`

Thrown as `PrismarineNetworkErrors.NotRaknetConnection`, which extends `Error`.

Code asked for the RakNet session of a player who joined over NetherNet.

## `PRISMARINE_PACK_SETTING_CHANGE_NOT_DECODED`

`Cannot handle a ServerboundPackSettingChangePacket without a payload`

Thrown as `PrismarineNetworkErrors.PackSettingChangeNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_PARTY_CHANGED_NOT_DECODED`

`Cannot handle a PartyChangedPacket without decoded data`

Thrown as `PrismarineNetworkErrors.PartyChangedNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_PLAYER_HAS_LEFT`

`{name} (entity {runtimeId}) has left: its session has no player`

Thrown as `PrismarineNetworkErrors.PlayerHasLeft`, which extends `Error`.

Code acted on a player whose session already ended, such as a delayed task that ran after
they left.

## `PRISMARINE_PLAYER_LOCATION_NOT_DECODED`

`Cannot handle a PlayerLocationPacket without a payload`

Thrown as `PrismarineNetworkErrors.PlayerLocationNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_PRESENTER_HAS_NO_SESSION`

`A Bedrock presenter with no session cannot show the player's inventory`

Thrown as `PrismarineNetworkErrors.PresenterHasNoSession`, which extends `Error`.

A Bedrock presenter built without a session was asked to show the player's inventory, which
it reads from the session. This is a bug in the server, or in a test that builds a
presenter on its own; pass a `BedrockSessionState`.

## `PRISMARINE_PROVIDER_CANNOT_RESTORE_REPLAY`

`Provider '{provider}' cannot restore replay snapshots`

Thrown as `PrismarineNetworkErrors.ProviderCannotRestoreReplay`, which extends `Error`.

The world storage provider cannot restore the world snapshot a replay starts from. Record
replays with a provider that can.

## `PRISMARINE_PURCHASE_RECEIPT_NOT_DECODED`

`Cannot handle a PurchaseReceiptPacket without decoded data`

Thrown as `PrismarineNetworkErrors.PurchaseReceiptNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_REPLAY_CONNECTION_CLOSED`

`Replay connection {connectionId} is no longer connected`

Thrown as `PrismarineNetworkErrors.ReplayConnectionClosed`, which extends `Error`.

A recorded session failed to replay: a recorded packet belongs to a connection that has
already closed in the replay.

## `PRISMARINE_REPLAY_CONNECTION_NOT_OPEN`

`Replay connection {connectionId} is not connected`

Thrown as `PrismarineNetworkErrors.ReplayConnectionNotOpen`, which extends `Error`.

A recorded session failed to replay: a recorded packet belongs to a connection that never
opened in the replay.

## `PRISMARINE_REPLAY_FRAME_HAS_SEVERAL_PACKETS`

`Replay frame for {packetName} contained {packetPayloadsCount} packets`

Thrown as `PrismarineNetworkErrors.ReplayFrameHasSeveralPackets`, which extends `Error`.

A recorded session failed to replay: a recorded frame holds more than the one packet a trace
records per frame.

## `PRISMARINE_REPLAY_MANIFEST_NOT_JSON`

`Invalid replay initial-state manifest JSON`

Thrown as `PrismarineNetworkErrors.ReplayManifestNotJson`, which extends `TypeError`.

A replay's starting-state manifest is not JSON, so the replay is damaged.

## `PRISMARINE_REPLAY_OUT_OF_ORDER`

`Replay expected inbound order {expectedOrder}, got {order}`

Thrown as `PrismarineNetworkErrors.ReplayOutOfOrder`, which extends `Error`.

A recorded session failed to replay: its packets are not in the order they were recorded, so
the trace is damaged.

## `PRISMARINE_REPLAY_PACKET_HAS_NO_HANDLER`

`Replay packet {packetName} has no handler`

Thrown as `PrismarineNetworkErrors.ReplayPacketHasNoHandler`, which extends `Error`.

A recorded session failed to replay: a recorded packet has no handler in this version of the
server.

## `PRISMARINE_REPLAY_PACKET_NOT_DECODABLE`

`Replay bytes did not decode as {name}`

Thrown as `PrismarineNetworkErrors.ReplayPacketNotDecodable`, which extends `Error`.

A recorded session failed to replay: a recorded packet no longer decodes as the packet it
was. It was recorded with a different version of the server.

## `PRISMARINE_REPLAY_PACKET_OUT_OF_SEQUENCE`

`Replay connection {connectionId} expected packet {expectedSequence}, got {sequence}`

Thrown as `PrismarineNetworkErrors.ReplayPacketOutOfSequence`, which extends `Error`.

A recorded session failed to replay: its packets are not in the order they were recorded, so
the trace is damaged.

## `PRISMARINE_REPLAY_PACKET_REJECTED`

`Replay packet {name} was rejected in the {phase} phase`

Thrown as `PrismarineNetworkErrors.ReplayPacketRejected`, which extends `Error`.

A recorded session failed to replay: the server refused a packet it accepted when the session
was recorded, so this version behaves differently.

## `PRISMARINE_REPLAY_PROTOCOL_MISMATCH`

`Replay protocol {protocolVersion} does not match connection protocol {connectionCodecProtocolVersion}`

Thrown as `PrismarineNetworkErrors.ReplayProtocolMismatch`, which extends `Error`.

A recorded session failed to replay: a recorded packet uses a different protocol version than
its connection.

## `PRISMARINE_REPLAY_PROVIDER_MISMATCH`

`Replay snapshot provider does not match the manifest`

Thrown as `PrismarineNetworkErrors.ReplayProviderMismatch`, which extends `Error`.

A replay was started with a different world storage provider than it was recorded with.

## `PRISMARINE_REPLAY_TICK_MISMATCH`

`Replay packet tick {expectedTick} does not match server tick {currentTick}`

Thrown as `PrismarineNetworkErrors.ReplayTickMismatch`, which extends `Error`.

A recorded session failed to replay: a packet arrived on a different tick than it was
recorded on, so the replay drifted from the recording.

## `PRISMARINE_RESPAWN_DIMENSION_NOT_READY`

`The respawn search answered {dimension}, which is not ready`

Thrown as `PrismarineNetworkErrors.RespawnDimensionNotReady`, which extends `Error`.

The respawn search picked a dimension that is not ready to spawn in. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_RESPAWN_NOT_DECODED`

`Cannot handle RespawnPacket without decoded data`

Thrown as `PrismarineNetworkErrors.RespawnNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_SCRIPT_MESSAGE_NOT_DECODED`

`Cannot handle a ScriptMessagePacket without decoded data`

Thrown as `PrismarineNetworkErrors.ScriptMessageNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_SET_DIFFICULTY_NOT_DECODED`

`Cannot handle SetDifficultyPacket without decoded data`

Thrown as `PrismarineNetworkErrors.SetDifficultyNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_SET_GAME_TYPE_NOT_DECODED`

`Cannot handle SetPlayerGameTypePacket without decoded data`

Thrown as `PrismarineNetworkErrors.SetGameTypeNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_SETTINGS_COMMAND_NOT_DECODED`

`Cannot handle a SettingsCommandPacket without decoded data`

Thrown as `PrismarineNetworkErrors.SettingsCommandNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_SEVERAL_TRANSPORTS_FAILED_TO_CLOSE`

`Several transports failed to close`

Thrown as `PrismarineNetworkErrors.SeveralTransportsFailedToClose`, which extends `Error`.

More than one transport threw while the server closed them. The cause holds every error, in the order the transports were closed.

## `PRISMARINE_SPAWN_LOST_DURING_JOIN`

`{name} lost its spawn before the join`

Thrown as `PrismarineNetworkErrors.SpawnLostDuringJoin`, which extends `Error`.

The world a joining player was to spawn in unloaded before they finished joining. This is a
bug in the server; report it with the stack trace.

## `PRISMARINE_STRUCTURE_BLOCK_UPDATE_NOT_DECODED`

`Cannot handle a StructureBlockUpdatePacket without decoded data`

Thrown as `PrismarineNetworkErrors.StructureBlockUpdateNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_STRUCTURE_TEMPLATE_REQUEST_NOT_DECODED`

`Cannot handle a StructureTemplateDataRequestPacket without decoded data`

Thrown as `PrismarineNetworkErrors.StructureTemplateRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_TRACE_NOT_JSON`

`Invalid inbound packet trace JSON`

Thrown as `PrismarineNetworkErrors.TraceNotJson`, which extends `Error`.

A packet trace file is not JSON, so it is damaged or not a trace.

## `PRISMARINE_TRACE_OUT_OF_ORDER`

`Inbound packet trace expected order {capturedCount}, got {order}`

Thrown as `PrismarineNetworkErrors.TraceOutOfOrder`, which extends `Error`.

A packet trace was recorded out of order, so it is damaged.

## `PRISMARINE_UNEXPECTED_JAVA_PACKET`

`Packet {packetId} has no place in the {phase} phase`

Thrown as `PrismarineNetworkErrors.UnexpectedJavaPacket`, which extends `Error`.

A Java Edition client sent a packet its connection's phase has no place for. The server
closes the connection; a client of another release, or a modified one, is the usual cause.

## `PRISMARINE_UNKNOWN_HELD_BLOCK`

`No block named {name}, held at {x} {y} {z}`

Thrown as `PrismarineNetworkErrors.UnknownHeldBlock`, which extends `Error`.

A player held a block the server's content does not define. The client and the server's packs
disagree.

## `PRISMARINE_UNSUPPORTED_REPLAY_MANIFEST`

`Unsupported or invalid replay initial-state manifest`

Thrown as `PrismarineNetworkErrors.UnsupportedReplayManifest`, which extends `TypeError`.

A replay's starting-state manifest was written by a different version of the server, or is
damaged.

## `PRISMARINE_UNSUPPORTED_TRACE_FORMAT`

`Unsupported inbound packet trace format or version`

Thrown as `PrismarineNetworkErrors.UnsupportedTraceFormat`, which extends `Error`.

A packet trace file was written by a different version of the server, or is not a trace.
<!-- /fact -->
