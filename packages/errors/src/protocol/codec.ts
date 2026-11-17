import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors the codec code of `@jsprismarine/protocol` throws. */
export const ProtocolCodecErrors = defineErrors('protocol', {
    /**
     * A protocol version's packet table gives two packet classes the same id. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    DuplicatePacketId: 'Protocol {protocolVersion} assigns packet id {id} to multiple classes!',
    /**
     * The entity identifier list was sent without its data, and the protocol context had none to
     * fall back on. This is a bug in the protocol codecs; report it with the stack trace.
     */
    MissingActorIdentifiers:
        'AvailableActorIdentifiersPacket requires entity identifier data in the packet or protocol context',
    /**
     * The biome definition list was sent without its data, and the protocol context had none to
     * fall back on. This is a bug in the protocol codecs; report it with the stack trace.
     */
    MissingBiomeDefinitions:
        'BiomeDefinitionListPacket requires biome definition data in the packet or protocol context',
    /**
     * A packet was decoded before it was given bytes to read. This is a bug in the protocol codecs;
     * report it with the stack trace.
     */
    NoReadBuffer: 'Cannot decode {name} without a read buffer',
    /**
     * A packet was encoded before its fields were set. This is a bug in the protocol codecs; report
     * it with the stack trace.
     */
    PacketHasNoData: 'Cannot serialize packet without data, PID: {id}',
    /**
     * An encrypted batch's checksum does not match its contents, so it was altered or the two
     * sides' encryption fell out of step. The connection is dropped; a modified client, or one that
     * writes the protocol differently than this server reads it, is the usual cause.
     */
    BatchChecksumMismatch: 'Checksum mismatch on batch {value}: expected {expected}, got {carried}',
    /**
     * A chunk publisher update was given a chunk position without numeric coordinates. This is a
     * bug in the protocol codecs; report it with the stack trace.
     */
    InvalidChunkCoordinates: {
        message: 'A chunk coordinate pair must have numeric x and z fields',
        base: TypeError
    },
    /**
     * The protocol codec registry was built with no codecs. This is a bug in the protocol codecs;
     * report it with the stack trace.
     */
    EmptyCodecRegistry: 'A protocol codec registry requires at least one codec!',
    /**
     * The protocol codec registry was built with preview codecs only. This is a bug in the protocol
     * codecs; report it with the stack trace.
     */
    NoReleaseCodec: 'A protocol codec registry requires at least one release codec!',
    /** A command list refers to a subcommand table it does not hold, so the packet is malformed. */
    MissingCommandSubcommandTable: 'Command {wireValue} points at missing subcommand table {index}',
    /**
     * A command list's constraint refers to an enum or value it does not hold, so the packet is
     * malformed.
     */
    MissingConstraintEnum: 'A constraint points at missing enum {enumSymbol} or value {enumValueSymbol}',
    /**
     * A packet was encoded for one protocol version with the codec of another. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    ContextCodecMismatch: 'Protocol context {protocolVersion} does not match codec {definitionProtocolVersion}!',
    /**
     * An entity metadata item has a type this protocol does not define, so the packet is malformed.
     */
    UnknownDataItemPayload: 'Data item {id} has an unknown type {type}',
    /**
     * An entity metadata item's declared type and its value disagree. This is a bug in the protocol
     * codecs; report it with the stack trace.
     */
    DataItemPayloadMismatch: 'Data item {id} selects payload {selector} but carries type {type}',
    /**
     * A data store update carries a value type this protocol does not define, so the packet is
     * malformed.
     */
    UnknownDataStoreValueType: 'Data store update {dataStoreName}/{property} has an unknown data type {type}',
    /**
     * An encrypted batch is shorter than its checksum, so it is truncated. The connection is
     * dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    EncryptedBatchTooShort: 'An encrypted batch is at least {checksumLength} bytes, got {byteLength}',
    /**
     * Encryption was set up with a key that is not 32 bytes. This is a bug in the protocol codecs;
     * report it with the stack trace.
     */
    InvalidEncryptionKey: 'An encryption key is 32 bytes, got {byteLength}',
    /** A command list's enum refers to a value it does not hold, so the packet is malformed. */
    MissingEnumValue: 'Enum {wireValue} points at missing enum value {index}',
    /**
     * A packet's body could not be decoded. The message ends with what went wrong. The connection
     * is dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    PayloadNotDecodable: 'Error deserializing packet payload: {e}',
    /**
     * A batch fragment was encoded before the connection agreed on compression. This is a bug in
     * the protocol codecs; report it with the stack trace.
     */
    FragmentWithoutCompression: 'Full-flush fragments require negotiated compression',
    /**
     * A batch fragment was encoded for a connection that does not use zlib. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    FragmentWithoutZlib: 'Full-flush fragments require zlib compression',
    /**
     * The base codec lacks one of the four packets the login handshake needs. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    HandshakePacketHasNoId: 'Handshake packet {name} has no id in the base codec!',
    /**
     * A sub-chunk heightmap was given the wrong number of rows. This is a bug in the protocol
     * codecs; report it with the stack trace.
     */
    HeightmapWrongRowCount: 'A heightmap needs {heightMapSide} rows, got {heightMapCount}',
    /**
     * A sub-chunk heightmap row was given the wrong number of heights. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    HeightmapRowWrongLength: 'A heightmap row needs {heightMapSide} heights, got {rowCount}',
    /**
     * An inventory transaction decoded without the body its protocol version carries. This is a bug
     * in the protocol codecs; report it with the stack trace.
     */
    MissingTransactionBody: 'Inventory Transaction has no versioned transaction body',
    /**
     * A codec was given the item table of a different protocol version. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    ItemDataCodecMismatch: 'Item data {protocolVersion} does not match codec {definitionProtocolVersion}!',
    /**
     * An item's extra data starts with a marker the protocol does not define, so the packet is
     * malformed. The connection is dropped; a modified client, or one that writes the protocol
     * differently than this server reads it, is the usual cause.
     */
    UnknownItemUserDataMarker: 'Item user data marker {marker} is neither {noTag} nor {tagFollows}',
    /**
     * An item's extra data uses a version the protocol does not define, so the packet is malformed.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    UnknownItemUserDataVersion: 'Item user data version {version} is not {userDataVersion}',
    /**
     * The jigsaw structure data packet was sent without its data, and the protocol context had none
     * to fall back on. This is a bug in the protocol codecs; report it with the stack trace.
     */
    MissingJigsawStructureData: 'JigsawStructureDataPacket requires structure data in the packet or protocol context',
    /**
     * An attribute layer sync decoded without the data its protocol version carries. This is a bug
     * in the protocol codecs; report it with the stack trace.
     */
    AttributeLayerDataNotDecoded: 'The layout read no Data variant',
    /**
     * Level settings were decoded on their own; they are decoded as part of the start game packet.
     */
    LevelSettingsNotDecodable: 'LevelSettings.deserialize is not implemented; decode StartGamePacket instead.',
    /**
     * A packet in a batch declares more bytes than the batch has left, so the batch is truncated.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    BatchPacketTruncated: 'Malformed batch: packet at offset {start} declares {length} bytes, {value} remain',
    /**
     * A packet length in a batch is malformed. The connection is dropped; a modified client, or one
     * that writes the protocol differently than this server reads it, is the usual cause.
     */
    BatchLengthUnterminated: 'Malformed batch: varint at offset {offset} did not terminate after 5 bytes',
    /**
     * A packet length in a batch is too large to be one. The connection is dropped; a modified
     * client, or one that writes the protocol differently than this server reads it, is the usual
     * cause.
     */
    BatchLengthOverflow: 'Malformed batch: varint at offset {offset} overflows 32 bits',
    /**
     * A batch ends inside a packet length, so it is truncated. The connection is dropped; a
     * modified client, or one that writes the protocol differently than this server reads it, is
     * the usual cause.
     */
    BatchLengthTruncated: 'Malformed batch: varint at offset {offset} runs past the end of the payload',
    /**
     * A batch holds an empty packet, which the protocol never sends. The connection is dropped; a
     * modified client, or one that writes the protocol differently than this server reads it, is
     * the usual cause.
     */
    EmptyBatchPacket: 'Malformed batch: zero length packet at offset {start}',
    /**
     * A Snappy-compressed batch copies from outside its own output, so it is damaged. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    SnappyCopyOutOfRange: 'Malformed Snappy block: copy exceeds its output',
    /**
     * A Snappy-compressed batch decompressed to fewer bytes than it declares, so it is truncated.
     * The connection is dropped; a modified client, or one that writes the protocol differently
     * than this server reads it, is the usual cause.
     */
    SnappyLengthMismatch: 'Malformed Snappy block: decoded {outputCursor} of {length} bytes',
    /**
     * A Snappy-compressed batch declares a length too large to be one. The connection is dropped; a
     * modified client, or one that writes the protocol differently than this server reads it, is
     * the usual cause.
     */
    SnappyLengthOverflow: 'Malformed Snappy block: length overflows 32 bits',
    /**
     * A Snappy-compressed batch has a literal that runs past its input or its declared length. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    SnappyLiteralOutOfRange: 'Malformed Snappy block: literal exceeds its input or output',
    /**
     * A Snappy-compressed batch ends inside a copy instruction. The connection is dropped; a
     * modified client, or one that writes the protocol differently than this server reads it, is
     * the usual cause.
     */
    SnappyTruncatedOneByteCopy: 'Malformed Snappy block: truncated 1-byte copy',
    /**
     * A Snappy-compressed batch ends inside a copy instruction. The connection is dropped; a
     * modified client, or one that writes the protocol differently than this server reads it, is
     * the usual cause.
     */
    SnappyTruncatedTwoByteCopy: 'Malformed Snappy block: truncated 2-byte copy',
    /**
     * A Snappy-compressed batch ends inside a copy instruction. The connection is dropped; a
     * modified client, or one that writes the protocol differently than this server reads it, is
     * the usual cause.
     */
    SnappyTruncatedFourByteCopy: 'Malformed Snappy block: truncated 4-byte copy',
    /**
     * A Snappy-compressed batch ends inside its length header. The connection is dropped; a
     * modified client, or one that writes the protocol differently than this server reads it, is
     * the usual cause.
     */
    SnappyTruncatedLengthPrefix: 'Malformed Snappy block: truncated length prefix',
    /**
     * A Snappy-compressed batch ends inside a literal's length. The connection is dropped; a
     * modified client, or one that writes the protocol differently than this server reads it, is
     * the usual cause.
     */
    SnappyTruncatedLiteralLength: 'Malformed Snappy block: truncated literal length',
    /**
     * A Snappy-compressed batch's length header is malformed. The connection is dropped; a modified
     * client, or one that writes the protocol differently than this server reads it, is the usual
     * cause.
     */
    SnappyLengthPrefixUnterminated: 'Malformed Snappy block: unterminated length prefix',
    /**
     * A packet was decoded by the class for a different packet id. This is a bug in the protocol
     * codecs; report it with the stack trace.
     */
    PacketIdMismatch: 'NetworkPacket ID mismatch: expected {expected}, got {pid}',
    /**
     * A datagram that should hold a packet batch starts with another id, so the sender does not
     * speak the Bedrock protocol, or the connection fell out of step.
     */
    NotBatch: 'Not a batch: expected id 0x{batchPacketId}, got 0x{batch}',
    /**
     * A packet's NBT field was given a value that is not an NBT tag. This is a bug in the protocol
     * codecs; report it with the stack trace.
     */
    NotNbtTag: { message: 'not an NBT tag: {value}', base: TypeError },
    /**
     * The codec registry holds more than one preview protocol; only the newest is kept. This is a
     * bug in the protocol codecs; report it with the stack trace.
     */
    SeveralPreviewCodecs: 'Only the newest preview is supported, but codecs {previews} are previews!',
    /**
     * A batch was encoded with a different number of packets and pre-encoded fragments. This is a
     * bug in the protocol codecs; report it with the stack trace.
     */
    FragmentCountMismatch: {
        message: 'Packet and fragment counts differ: {packetsCount} packets, {fragmentsCount} fragments',
        base: RangeError
    },
    /**
     * A packet class has no id in the default protocol, so it cannot be sent without a
     * version-specific codec. This is a bug in the protocol codecs; report it with the stack trace.
     */
    PacketHasNoDefaultNetworkId: 'Packet {name} has no default network id',
    /**
     * A command list's parameter has an argument type this protocol does not define, so the packet
     * is malformed.
     */
    UnknownParameterType: 'Parameter {wireValue} carries unknown parse symbol {type}',
    /**
     * A command list's parameter refers to an enum it does not hold, so the packet is malformed.
     */
    MissingParameterEnum: 'Parameter {wireValue} points at missing enum {index}',
    /**
     * A command list's parameter refers to a postfix it does not hold, so the packet is malformed.
     */
    MissingParameterPostfix: 'Parameter {wireValue} points at missing postfix {index}',
    /**
     * A command list's parameter refers to a soft enum it does not hold, so the packet is
     * malformed.
     */
    MissingParameterSoftEnum: 'Parameter {wireValue} points at missing soft enum {index}',
    /**
     * A command list's parameter refers to a subcommand table it does not hold, so the packet is
     * malformed.
     */
    MissingParameterSubcommandTable: 'Parameter {wireValue} points at missing subcommand table {index}',
    /**
     * The registry holds a preview protocol older than the newest release, which no current preview
     * client speaks. Drop its codec.
     */
    StalePreviewCodec: 'Preview protocol {protocolVersion} is older than release {advertisedProtocolVersion}; drop it!',
    /**
     * A protocol codec was built without the item table its version needs. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    MissingItemData: 'Protocol {protocolVersion} requires versioned item data!',
    /**
     * A Snappy-compressed batch declares more bytes than the server decompresses, which guards
     * against batches built to exhaust memory. The connection is dropped; a modified client, or one
     * that writes the protocol differently than this server reads it, is the usual cause.
     */
    SnappyBlockTooLarge: 'Snappy block expands to {length} bytes, limit is {maxOutputLength}',
    /**
     * A text attribute was sent to a client whose protocol has no text attributes. This is a bug in
     * the protocol codecs; report it with the stack trace.
     */
    StringAttributeUnsupported: 'A string attribute needs protocol {protocol2259}; this packet is for {codecProtocol}',
    /**
     * A command list's subcommand refers to a value it does not hold, so the packet is malformed.
     */
    MissingSubcommandValue: 'Subcommand {wireValue} points at missing value {first}',
    /**
     * A batch on a compressed connection lacks its compression byte, so it is truncated. The
     * connection is dropped; a modified client, or one that writes the protocol differently than
     * this server reads it, is the usual cause.
     */
    BatchMissingCompressionByte: 'Truncated batch: compression is negotiated but the algorithm byte is missing',
    /**
     * The codec registry was given two codecs for one protocol version. This is a bug in the
     * protocol codecs; report it with the stack trace.
     */
    DuplicateCodecVersion: 'Two codecs claim the same protocol version!',
    /**
     * An environment attribute field holds a value its enum does not define, so the packet is
     * malformed.
     */
    UnknownEnumValue: 'Unknown {label} {value}',
    /**
     * An environment attribute field names an enum member that does not exist, so the packet is
     * malformed.
     */
    UnknownEnumName: 'Unknown {label} "{name}"',
    /**
     * An environment attribute's payload type is one the protocol does not define, so the packet is
     * malformed.
     */
    UnknownAttributePayloadAlternative: 'Unknown attribute payload alternative {type}',
    /**
     * An environment attribute's value type is one the protocol does not define, so the packet is
     * malformed.
     */
    UnknownAttributeValueAlternative: 'Unknown attribute value alternative {type}',
    /**
     * An environment attribute transition names an easing function the protocol does not define, so
     * the packet is malformed.
     */
    UnknownEasingFunctionId: 'Unknown easing_function {easing}',
    /**
     * A debug shape's extra data has a type the protocol does not define, so the packet is
     * malformed.
     */
    UnknownPrimitiveShapeExtraDataAlternative: 'Unknown primitive shape extra data alternative {type}',
    /**
     * The connection asked for a compression algorithm the protocol does not define. The connection
     * is dropped; a modified client, or one that writes the protocol differently than this server
     * reads it, is the usual cause.
     */
    UnsupportedCompressionAlgorithm: 'Unsupported compression algorithm: {algorithm}',
    /**
     * The blocks the server would send differ from the palette captured from Bedrock Dedicated
     * Server, so clients would see the wrong blocks. The error's `disagreements` list every
     * difference; regenerate the block data for the pinned server.
     */
    BlockPaletteMismatch:
        'the block registry disagrees with the captured palette in {count} place(s), first: {block} {detail}'
});
