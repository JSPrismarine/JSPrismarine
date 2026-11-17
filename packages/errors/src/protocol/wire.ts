import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors the wire code of `@jsprismarine/protocol` throws. */
export const ProtocolWireErrors = defineErrors('protocol', {
    /**
     * A movement prediction packet's entity flags run past the most bytes the protocol uses, so the
     * packet is malformed. The connection is dropped; a modified client, or one that writes the
     * protocol differently than this server reads it, is the usual cause.
     */
    ActorFlagsTooLong: 'Actor flag bit set runs past {maxFlagBytes} bytes',
    /**
     * An entity link has a link type the protocol does not define, so the packet is malformed. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    UnknownActorLinkType: 'Actor link {targetA} -> {targetB} carries unknown link type {type}',
    /**
     * An attribute layer packet was encoded onto a plain binary stream. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    AttributeLayerNeedsNetworkStream: {
        message: 'The attribute layer structures need a NetworkBinaryStream',
        base: TypeError
    },
    /**
     * A login's connection request has bytes after its client data, so the client wrote a layout
     * this server does not read. The connection is dropped; a modified client, or one that writes
     * the protocol differently than this server reads it, is the usual cause.
     */
    ConnectionRequestHasTrailingBytes: 'The connection request has {unread} unread bytes after the client data',
    /**
     * An entity metadata item has a type the protocol does not define, so the packet is malformed.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    UnknownDataItemType: 'Data item {id} carries unknown type {selector}',
    /**
     * An entity metadata item declares one type and carries a value of another. This is a bug in
     * the protocol codecs; report it with the stack trace.
     */
    DataItemTypeMismatch: 'Data item {id} declares type {selector} but carries type {type}',
    /**
     * A data store entry has a type the protocol does not define, so the packet is malformed. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    UnknownDataStoreEntryType: 'Data store entry has an unknown type {type}',
    /**
     * A data store property has a value type the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownDataStorePropertyType: 'Data store property value has an unknown type {type}',
    /**
     * A data store update has a value type the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownDataStoreUpdateType: 'Data store update has an unknown data type {type}',
    /**
     * An item stack response carries a durability correction too large for the field. This is a bug
     * in the protocol codecs; report it with the stack trace.
     */
    DurabilityCorrectionTooLarge: {
        message: 'Durability correction {durabilityCorrection} for slot {slot} does not fit an int16',
        base: RangeError
    },
    /**
     * A game rule in the start game packet has a value type the protocol does not define. This is a
     * bug in the protocol codecs; report it with the stack trace.
     */
    UnknownGameRuleType: 'Game rule {name} has an unknown value type {type}',
    /**
     * A packet field has no wire layout for this protocol version, so the packet cannot be written
     * or read at it. This is a bug in the protocol codecs; report it with the stack trace.
     */
    NoLayoutAtProtocol: '{name}.{key} has no layout at protocol {protocolVersion}',
    /**
     * A command enum constraint refers to a value its enum does not hold. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    InvalidEnumValueOffset: 'Invalid enum value offset {valueOffset}',
    /**
     * A client's inventory transaction lists more actions than the protocol allows, which guards
     * against packets built to exhaust memory. The connection is dropped; a modified client, or one
     * that writes the protocol differently than this server reads it, is the usual cause.
     */
    TooManyTransactionActions: {
        message: 'An inventory transaction carried {actionsCount} actions; the docs allow {maxInventoryActions}',
        base: RangeError
    },
    /**
     * An inventory transaction was encoded without its body. This is a bug in the protocol codecs;
     * report it with the stack trace.
     */
    MissingTransactionPayload: {
        message: 'An inventory transaction needs its transaction payload',
        base: TypeError
    },
    /**
     * A client's item stack request lists more actions than the protocol allows. The connection is
     * dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    TooManyItemStackActions: {
        message:
            'Item stack request {requestId} names {actionCount} actions; the docs allow at most {maxRequestActions}',
        base: RangeError
    },
    /**
     * A client's item stack request packet lists more requests than the protocol allows. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    TooManyItemStackRequests: {
        message: 'An item stack request packet names {count} requests; the docs allow at most {maxRequests}',
        base: RangeError
    },
    /**
     * A client's map info request lists more pixels than the protocol allows. The connection is
     * dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    TooManyMapPixels: 'MapInfoRequest claims {count} client pixels; the limit is {maxClientPixels}',
    /**
     * A resource pack response was encoded with a status the protocol does not define. This is a
     * bug in the protocol codecs; report it with the stack trace.
     */
    UnknownResourcePackStatus: 'No resource pack response alternative for status {status}',
    /**
     * An attribute layer packet was encoded without the data its protocol version carries. This is
     * a bug in the protocol codecs; report it with the stack trace.
     */
    MissingAttributeLayerData: {
        message: 'The payload carries no Data in the {layout} layout of this protocol version',
        base: TypeError
    },
    /**
     * A player list packet was encoded without its entries. This is a bug in the protocol codecs;
     * report it with the stack trace.
     */
    MissingPlayerListEntries: {
        message: 'A player list cannot be written without its entries',
        base: TypeError
    },
    /**
     * A player was added to the player list before their skin was known. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    PlayerListEntryHasNoSkin: 'Player list entry {uUID} has no skin, so it cannot be added',
    /**
     * A player location packet's type and body disagree, so the packet is malformed. The connection
     * is dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    PlayerLocationTypeMismatch: 'Player location selector {selector} does not match type {packetType}',
    /**
     * A client's input packet lists more block actions than the protocol allows. The connection is
     * dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    TooManyBlockActions: {
        message: 'PlayerAuthInput claims {actionCount} block actions; the docs allow {maxBlockActions}',
        base: RangeError
    },
    /**
     * A client's input packet claims more input flags than the protocol defines. The connection is
     * dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    TooManyInputFlags: {
        message: 'PlayerAuthInput claims {flagCount} input flags; there are {inputFlagCount}',
        base: RangeError
    },
    /**
     * A client's input packet carries an item use with more actions than the protocol allows. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    TooManyItemUseActions: {
        message: 'A PlayerAuthInput item use carried {actionCount} actions; the docs allow {maxInventoryActions}',
        base: RangeError
    },
    /**
     * A recipe id was encoded from a value that is not 16 bytes. This is a bug in the protocol
     * codecs; report it with the stack trace.
     */
    InvalidRecipeUuid: 'A recipe UUID is sixteen bytes, got {byteLength}',
    /**
     * A release-item transaction was encoded without its data. This is a bug in the protocol
     * codecs; report it with the stack trace.
     */
    MissingReleaseItemData: {
        message: 'A release-item transaction needs release-item data',
        base: TypeError
    },
    /**
     * A packet's skin field was encoded without a skin. This is a bug in the protocol codecs;
     * report it with the stack trace.
     */
    MissingSkin: { message: 'A skin field cannot be written without a skin', base: TypeError },
    /**
     * A sound data update's type and body disagree, so the packet is malformed. The connection is
     * dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    SoundDataTypeMismatch: 'Sound data update selector {type} does not match its type {tag}',
    /**
     * A sub-chunk result was sent to a client whose protocol has no `UNDEFINED` result. This is a
     * bug in the protocol codecs; report it with the stack trace.
     */
    UndefinedSubChunkResultUnsupported: {
        message: 'SubChunkRequestResult.UNDEFINED is unavailable before protocol 2207',
        base: RangeError
    },
    /**
     * A book edit has an action the protocol does not define, so the packet is malformed. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    UnknownBookEditAction: 'Unknown book edit action {action}',
    /**
     * An attribute layer packet has a data type the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownAttributeLayerDataType: 'Unknown ClientboundAttributeLayerSyncPacket data variant {type}',
    /**
     * A command block update targets something the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownCommandBlockTargetAlternative: 'Unknown command block target alternative {selector}',
    /**
     * A client closed a data-driven screen with a reason the protocol does not define, so the
     * packet is malformed. The connection is dropped; a modified client, or one that writes the
     * protocol differently than this server reads it, is the usual cause.
     */
    UnknownScreenCloseReason: 'Unknown DataDrivenScreenClosedReason "{value}"',
    /**
     * A camera instruction names an easing function the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownEasingFunction: 'Unknown easing_function "{name}"',
    /**
     * An entity override update has a type the protocol does not define. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    UnknownEntityOverrideUpdateType: 'Unknown entity override update type {type}',
    /**
     * A game rule has a value type the protocol does not define, so the packet is malformed. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    UnknownGameRuleValueAlternative: 'Unknown game rule value alternative {selector}',
    /**
     * An item stack request names an item with a descriptor kind the protocol does not define, so
     * the packet is malformed. The connection is dropped; a modified client, or one that writes the
     * protocol differently than this server reads it, is the usual cause.
     */
    UnknownItemDescriptorKind: 'Unknown item descriptor kind {kind} in an item stack request',
    /**
     * An item stack request has an action the protocol does not define, so the packet is malformed.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    UnknownItemStackRequestActionType: 'Unknown item stack request action type {type}',
    /**
     * A music packet names a playback state the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownMusicPlaybackState: 'Unknown MusicPlaybackState "{value}"',
    /**
     * A pack setting change has a value type the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownPackSettingValueAlternative: 'Unknown pack setting value alternative {selector}',
    /**
     * A party destination cookie names an intent the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownPartyDestinationCookieIntent: 'Unknown party destination cookie intent "{name}"',
    /**
     * A player location packet has a type the protocol does not define, so the packet is malformed.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    UnknownPlayerLocationAlternative: 'Unknown player location alternative {selector}',
    /**
     * A recipe ingredient uses a descriptor the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownRecipeIngredientDescriptor: 'Unknown recipe ingredient descriptor {name}',
    /**
     * A recipe ingredient uses a descriptor variant the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownRecipeIngredientDescriptorVariant: 'Unknown recipe ingredient descriptor variant {variant}',
    /**
     * A client answered the resource pack offer with a status the protocol does not define, so the
     * packet is malformed. The connection is dropped; a modified client, or one that writes the
     * protocol differently than this server reads it, is the usual cause.
     */
    UnknownResourcePackResponseAlternative: 'Unknown resource pack response alternative {selector}',
    /**
     * A scoreboard update has an action the protocol does not define, so the packet is malformed.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    UnknownSetScoreAlternative: 'Unknown set score alternative {action}',
    /**
     * A command soft enum update has a type the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownSoftEnumUpdateType: 'Unknown soft enum update type {type}',
    /**
     * A sound data update has a type the protocol does not define, so the packet is malformed. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    UnknownSoundDataUpdateAlternative: 'Unknown sound data update alternative {type}',
    /**
     * A sub-chunk response has a result code the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownSubChunkRequestResult: { message: 'Unknown sub chunk request result {result}', base: RangeError },
    /**
     * A world clock sync has a data type the protocol does not define, so the packet is malformed.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    UnknownWorldClockDataType: 'Unknown SyncWorldClocksPacket data type {type}',
    /**
     * A telemetry event has a data type the protocol does not define, so the packet is malformed.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    UnknownTelemetryEventDataAlternative: 'Unknown telemetry event data alternative {ordinal}',
    /**
     * A chat packet has a body type the protocol does not define, so the packet is malformed. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    UnknownTextBodyType: 'Unknown TextPacket body variant {variant}',
    /**
     * An inventory transaction has a type the protocol does not define, so the packet is malformed.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    UnknownTransactionType: { message: 'Unknown transaction type {transactionType}', base: TypeError },
    /**
     * A use-item-on-entity transaction was encoded without its data. This is a bug in the protocol
     * codecs; report it with the stack trace.
     */
    MissingUseItemOnEntityData: {
        message: 'A use-item-on-entity transaction needs use-item-on-entity data',
        base: TypeError
    },
    /**
     * A use-item transaction was encoded without its data. This is a bug in the protocol codecs;
     * report it with the stack trace.
     */
    MissingUseItemData: { message: 'A use-item transaction needs use-item data', base: TypeError },
    /**
     * A client's use-item transaction is longer than this server's layout of it, so the client
     * writes a newer or different layout. The connection is dropped; a modified client, or one that
     * writes the protocol differently than this server reads it, is the usual cause.
     */
    UseItemTransactionHasTrailingBytes:
        "UseItem transaction left {byteLength} bytes unread: the packet layout does not match the client's",
    /**
     * A UUID was parsed from nothing. This is a bug in the protocol codecs; report it with the
     * stack trace.
     */
    MissingUuid: 'uuid is null or undefined',
    /**
     * A UUID was read from a value that is not 16 bytes. This is a bug in the protocol codecs;
     * report it with the stack trace.
     */
    InvalidUuidLength: 'UUID must have 16 bytes'
});
