import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors the network code of `@jsprismarine/prismarine` throws. */
export const PrismarineNetworkErrors = defineErrors('prismarine', {
    /**
     * The folder the server writes packet dumps to belongs to another user, so the server refuses
     * to write there. Use a folder you own.
     */
    DumpFolderOwnedByOtherUser: '{directory} belongs to another user',
    /**
     * A batch of block changes failed to send and had no packet to name in the report. This is a
     * bug in the server; report it with the stack trace.
     */
    EmptyBlockChangeBatch: 'A block-change batch has no packet to report',
    /**
     * A block change batch was built for a sub-chunk with no changes. This is a bug in the server;
     * report it with the stack trace.
     */
    EmptyBlockChangeSubChunk: 'A block-change subchunk cannot be empty',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    BookEditNotDecoded: 'BookEditPacket has no payload after validation',
    /**
     * The server tried to send a batch larger than one NetherNet message can carry. This is a bug
     * in the server; report it with the stack trace.
     */
    FrameTooLargeForNethernet: {
        message: "A {byteLength} byte frame exceeds NetherNet's message limit",
        base: RangeError
    },
    /**
     * The folder the server writes packet dumps to can be written by other users, so the server
     * refuses to write there. Remove the group and world write permission, or use another folder.
     */
    DumpFolderWritableByOthers: '{directory} can be written by other users',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    AnvilDamageNotDecoded: 'Cannot handle an AnvilDamagePacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    BlockPickRequestNotDecoded: 'Cannot handle a BlockPickRequestPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    MovementPredictionSyncNotDecoded: 'Cannot handle a ClientMovementPredictionSyncPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    CommandBlockUpdateNotDecoded: 'Cannot handle a CommandBlockUpdatePacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    EmoteListNotDecoded: 'Cannot handle an EmoteListPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    LabTableNotDecoded: 'Cannot handle a LabTablePacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    LecternUpdateNotDecoded: 'Cannot handle a LecternUpdatePacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    LoginNotDecoded: 'Cannot handle LoginPacket without packet data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    PartyChangedNotDecoded: 'Cannot handle a PartyChangedPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    PlayerLocationNotDecoded: 'Cannot handle a PlayerLocationPacket without a payload',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    PurchaseReceiptNotDecoded: 'Cannot handle a PurchaseReceiptPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    RespawnNotDecoded: 'Cannot handle RespawnPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    LoadingScreenNotDecoded: 'Cannot handle a ServerboundLoadingScreenPacket without a payload',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    PackSettingChangeNotDecoded: 'Cannot handle a ServerboundPackSettingChangePacket without a payload',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    SetDifficultyNotDecoded: 'Cannot handle SetDifficultyPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    FurnaceOptionsNotDecoded: 'Cannot handle a SetPlayerFurnaceOptionsPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    SetGameTypeNotDecoded: 'Cannot handle SetPlayerGameTypePacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    SettingsCommandNotDecoded: 'Cannot handle a SettingsCommandPacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    StructureBlockUpdateNotDecoded: 'Cannot handle a StructureBlockUpdatePacket without decoded data',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    StructureTemplateRequestNotDecoded: 'Cannot handle a StructureTemplateDataRequestPacket without decoded data',
    /**
     * The chunk batch cache was given a size limit that is not a whole, non-negative number of
     * bytes.
     */
    InvalidChunkCacheLimit: {
        message: 'Chunk batch cache limit must be a non-negative integer, got {maxBytes}',
        base: RangeError
    },
    /**
     * One chunk is larger than a player's whole send queue, so it could never be sent. This is a
     * bug in the server; report it with the stack trace.
     */
    ChunkTooLargeForQueue: {
        message: 'Chunk payload {memoryBytes} exceeds the {queuedChunkBytesLimit}-byte queue limit',
        base: RangeError
    },
    /**
     * The key a client's login names is not on the curve Bedrock uses, so encryption cannot be set
     * up with it. The client is modified or broken.
     */
    InvalidClientIdentityKey: 'The client identity key is not a {bedrockCurve} public key',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    CommandRequestNotDecoded: 'CommandRequestPacket has no decoded payload',
    /** Code asked for the RakNet session of a player who joined over NetherNet. */
    NotRaknetConnection: 'Connection {id} did not connect over RakNet',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    DisconnectNotDecoded: 'DisconnectPacket has no payload',
    /**
     * Code acted on a player whose session already ended, such as a delayed task that ran after
     * they left.
     */
    PlayerHasLeft: '{name} (entity {runtimeId}) has left: its session has no player',
    /**
     * A shared batch was encoded without the protocol key its cached fragments are filed under.
     * This is a bug in the server; report it with the stack trace.
     */
    FragmentWithoutCodecKey: 'Full-flush fragments require a protocol codec cache key',
    /** Two handlers were registered for the same packet. */
    DuplicateHandler: 'Handler for {packetName} already exists!',
    /**
     * A packet that must be handled during the world tick has no handler there. This is a bug in
     * the server; report it with the stack trace.
     */
    NoInputLaneHandler: '{name} has no input-lane handler',
    /** A packet trace was recorded out of order, so it is damaged. */
    TraceOutOfOrder: 'Inbound packet trace expected order {capturedCount}, got {order}',
    /** Code asked for the handler of a packet that has none. */
    NoHandler: 'Invalid handler for packet {packetName}!',
    /** A packet trace file is not JSON, so it is damaged or not a trace. */
    TraceNotJson: 'Invalid inbound packet trace JSON',
    /** A packet trace holds a record of the wrong shape, so it is damaged. */
    InvalidTraceRecord: 'Invalid inbound packet trace record',
    /** A packet trace's records are not a list, so it is damaged. */
    InvalidTraceRecords: 'Invalid inbound packet trace records',
    /**
     * A replay's starting-state manifest does not have the shape the server writes, so it cannot be
     * saved. This is a bug in the server; report it with the stack trace.
     */
    InvalidReplayManifest: { message: 'Invalid replay initial-state manifest', base: TypeError },
    /** A replay's starting-state manifest is not JSON, so the replay is damaged. */
    ReplayManifestNotJson: { message: 'Invalid replay initial-state manifest JSON', base: TypeError },
    /**
     * The packet dump path is not a folder, or is a symbolic link, which the server refuses so
     * dumps cannot land elsewhere. Point it at a real folder.
     */
    DumpPathNotFolder: '{directory} is not a directory, or is a symbolic link',
    /**
     * A large shared batch failed to send and had no packet to name in the report. This is a bug in
     * the server; report it with the stack trace.
     */
    EmptySharedBatch: 'A large shared batch has no packet to report',
    /**
     * A world lists a dimension without its dimension type, so the client cannot be told about it.
     * The world's dimension config is incomplete.
     */
    DimensionWithoutType: 'Level {name} announces dimension {dimensionType} without a type',
    /**
     * A client's login holds a token that is not a JSON web token, so the client is modified or
     * broken.
     */
    LoginTokenIsNotJwt: 'The login token is not a JWT',
    /**
     * The world a joining player was to spawn in unloaded before they finished joining. This is a
     * bug in the server; report it with the stack trace.
     */
    SpawnLostDuringJoin: '{name} lost its spawn before the join',
    /** A message was sent to a player with no text. */
    EmptyMessage: 'A message is required',
    /**
     * Sending block changes lost track of a change. This is a bug in the server; report it with the
     * stack trace.
     */
    MissingBlockChange: 'Missing block change at flush index {index}',
    /**
     * Sending block changes lost an encoded packet. This is a bug in the server; report it with the
     * stack trace.
     */
    MissingEncodedBlockPacket: 'Missing encoded block packet',
    /**
     * Sending entity movement lost an entity's packet. This is a bug in the server; report it with
     * the stack trace.
     */
    MissingEncodedMovement: 'Missing encoded movement for runtime id {runtimeId}',
    /**
     * Sending entity movement lost an entity's encoded bytes. This is a bug in the server; report
     * it with the stack trace.
     */
    MissingMovementBytes: 'Missing movement bytes for runtime id {runtimeId}',
    /**
     * A batch of entity movement failed to send and had no packet to name in the report. This is a
     * bug in the server; report it with the stack trace.
     */
    EmptyMovementBatch: 'A movement batch has no packet to report',
    /**
     * A NetherNet client sent a frame that is not a packet batch, so the client is modified or
     * speaks another protocol.
     */
    NethernetFrameNotBatch: 'A NetherNet frame must be a batch, got id 0x{payload}',
    /**
     * A player held a block the server's content does not define. The client and the server's packs
     * disagree.
     */
    UnknownHeldBlock: 'No block named {name}, held at {x} {y} {z}',
    /**
     * A connection's compression changed while packets were waiting to be sent under the old
     * settings. This is a bug in the server; report it with the stack trace.
     */
    CompressionChangedDuringFlush: 'Outbound packet compression changed while a queue flush was pending',
    /**
     * A batch was encoded with a different number of packets and buffers. This is a bug in the
     * server; report it with the stack trace.
     */
    BufferCountMismatch: {
        message: 'Packet and buffer counts differ: {packetsCount} packets, {packetBuffersCount} buffers',
        base: RangeError
    },
    /**
     * A batch was encoded with a different number of packets and fragment discriminators. This is a
     * bug in the server; report it with the stack trace.
     */
    DiscriminatorCountMismatch: {
        message:
            'Packet and fragment-discriminator counts differ: {buffersCount} packets, {discriminatorsCount} discriminators',
        base: RangeError
    },
    /**
     * A batch was encoded with a different number of packets and fragment keys. This is a bug in
     * the server; report it with the stack trace.
     */
    FragmentKeyCountMismatch: {
        message: 'Packet and fragment-key counts differ: {buffersCount} packets, {keysCount} keys',
        base: RangeError
    },
    /** A packet encoded to nothing. This is a bug in the server; report it with the stack trace. */
    EmptyPacketEncoding: 'Packet encoding returned no bytes',
    /**
     * The world storage provider cannot restore the world snapshot a replay starts from. Record
     * replays with a provider that can.
     */
    ProviderCannotRestoreReplay: "Provider '{provider}' cannot restore replay snapshots",
    /**
     * A recorded session failed to replay: a recorded packet no longer decodes as the packet it
     * was. It was recorded with a different version of the server.
     */
    ReplayPacketNotDecodable: 'Replay bytes did not decode as {name}',
    /**
     * A recorded session failed to replay: its packets are not in the order they were recorded, so
     * the trace is damaged.
     */
    ReplayPacketOutOfSequence: 'Replay connection {connectionId} expected packet {expectedSequence}, got {sequence}',
    /**
     * A recorded session failed to replay: a recorded packet belongs to a connection that has
     * already closed in the replay.
     */
    ReplayConnectionClosed: 'Replay connection {connectionId} is no longer connected',
    /**
     * A recorded session failed to replay: a recorded packet belongs to a connection that never
     * opened in the replay.
     */
    ReplayConnectionNotOpen: 'Replay connection {connectionId} is not connected',
    /**
     * A recorded session failed to replay: its packets are not in the order they were recorded, so
     * the trace is damaged.
     */
    ReplayOutOfOrder: 'Replay expected inbound order {expectedOrder}, got {order}',
    /**
     * A recorded session failed to replay: a recorded frame holds more than the one packet a trace
     * records per frame.
     */
    ReplayFrameHasSeveralPackets: 'Replay frame for {packetName} contained {packetPayloadsCount} packets',
    /**
     * A recorded session failed to replay: a recorded packet has no handler in this version of the
     * server.
     */
    ReplayPacketHasNoHandler: 'Replay packet {packetName} has no handler',
    /**
     * A recorded session failed to replay: a packet arrived on a different tick than it was
     * recorded on, so the replay drifted from the recording.
     */
    ReplayTickMismatch: 'Replay packet tick {expectedTick} does not match server tick {currentTick}',
    /**
     * A recorded session failed to replay: the server refused a packet it accepted when the session
     * was recorded, so this version behaves differently.
     */
    ReplayPacketRejected: 'Replay packet {name} was rejected in the {phase} phase',
    /**
     * A recorded session failed to replay: a recorded packet uses a different protocol version than
     * its connection.
     */
    ReplayProtocolMismatch:
        'Replay protocol {protocolVersion} does not match connection protocol {connectionCodecProtocolVersion}',
    /** A replay was started with a different world storage provider than it was recorded with. */
    ReplayProviderMismatch: 'Replay snapshot provider does not match the manifest',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    ChunkRadiusRequestNotDecoded: 'RequestChunkRadiusPacket has no payload',
    /**
     * A packet reached its handler without the decoded body the handler reads. This is a bug in the
     * server; report it with the stack trace.
     */
    NetworkSettingsRequestNotDecoded: 'RequestNetworkSettingsPacket has no payload',
    /**
     * The respawn search picked a dimension that is not ready to spawn in. This is a bug in the
     * server; report it with the stack trace.
     */
    RespawnDimensionNotReady: 'The respawn search answered {dimension}, which is not ready',
    /** A packet trace file was written by a different version of the server, or is not a trace. */
    UnsupportedTraceFormat: 'Unsupported inbound packet trace format or version',
    /**
     * A replay's starting-state manifest was written by a different version of the server, or is
     * damaged.
     */
    UnsupportedReplayManifest: {
        message: 'Unsupported or invalid replay initial-state manifest',
        base: TypeError
    },
    /** More than one transport threw while the server closed them. The cause holds every error, in the order the transports were closed. */
    SeveralTransportsFailedToClose: 'Several transports failed to close',
    /**
     * The block palette the server's content builds differs from the one the client expects, so
     * players would see the wrong blocks. The error's `disagreements` list every difference; a pack
     * that changes vanilla blocks is the usual cause.
     */
    ContentPaletteMismatch:
        "the content block palette disagrees with the client's in {count} place(s), first: {block} {detail}"
});
