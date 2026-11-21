---
title: '@jsprismarine/protocol errors'
description: The code, message and meaning of every error @jsprismarine/protocol throws.
group: Documents
category: Errors
---

# @jsprismarine/protocol errors

These are the errors `@jsprismarine/protocol` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.protocol -->
## Codec

### `PROTOCOL_ATTRIBUTE_LAYER_DATA_NOT_DECODED`

`The layout read no Data variant`

Thrown as `ProtocolCodecErrors.AttributeLayerDataNotDecoded`, which extends `Error`.

An attribute layer sync decoded without the data its protocol version carries. This is a bug
in the protocol codecs; report it with the stack trace.

### `PROTOCOL_BATCH_CHECKSUM_MISMATCH`

`Checksum mismatch on batch {value}: expected {expected}, got {carried}`

Thrown as `ProtocolCodecErrors.BatchChecksumMismatch`, which extends `Error`.

An encrypted batch's checksum does not match its contents, so it was altered or the two
sides' encryption fell out of step. The connection is dropped; a modified client, or one that
writes the protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_BATCH_LENGTH_OVERFLOW`

`Malformed batch: varint at offset {offset} overflows 32 bits`

Thrown as `ProtocolCodecErrors.BatchLengthOverflow`, which extends `Error`.

A packet length in a batch is too large to be one. The connection is dropped; a modified
client, or one that writes the protocol differently than this server reads it, is the usual
cause.

### `PROTOCOL_BATCH_LENGTH_TRUNCATED`

`Malformed batch: varint at offset {offset} runs past the end of the payload`

Thrown as `ProtocolCodecErrors.BatchLengthTruncated`, which extends `Error`.

A batch ends inside a packet length, so it is truncated. The connection is dropped; a
modified client, or one that writes the protocol differently than this server reads it, is
the usual cause.

### `PROTOCOL_BATCH_LENGTH_UNTERMINATED`

`Malformed batch: varint at offset {offset} did not terminate after 5 bytes`

Thrown as `ProtocolCodecErrors.BatchLengthUnterminated`, which extends `Error`.

A packet length in a batch is malformed. The connection is dropped; a modified client, or one
that writes the protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_BATCH_MISSING_COMPRESSION_BYTE`

`Truncated batch: compression is negotiated but the algorithm byte is missing`

Thrown as `ProtocolCodecErrors.BatchMissingCompressionByte`, which extends `Error`.

A batch on a compressed connection lacks its compression byte, so it is truncated. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_BATCH_PACKET_TRUNCATED`

`Malformed batch: packet at offset {start} declares {length} bytes, {value} remain`

Thrown as `ProtocolCodecErrors.BatchPacketTruncated`, which extends `Error`.

A packet in a batch declares more bytes than the batch has left, so the batch is truncated.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_BLOCK_PALETTE_MISMATCH`

`the block registry disagrees with the captured palette in {count} place(s), first: {block} {detail}`

Thrown as `ProtocolCodecErrors.BlockPaletteMismatch`, which extends `Error`.

The blocks the server would send differ from the palette captured from Bedrock Dedicated
Server, so clients would see the wrong blocks. The error's `disagreements` list every
difference; regenerate the block data for the pinned server.

### `PROTOCOL_CONTEXT_CODEC_MISMATCH`

`Protocol context {protocolVersion} does not match codec {definitionProtocolVersion}!`

Thrown as `ProtocolCodecErrors.ContextCodecMismatch`, which extends `Error`.

A packet was encoded for one protocol version with the codec of another. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_DATA_ITEM_PAYLOAD_MISMATCH`

`Data item {id} selects payload {selector} but carries type {type}`

Thrown as `ProtocolCodecErrors.DataItemPayloadMismatch`, which extends `Error`.

An entity metadata item's declared type and its value disagree. This is a bug in the protocol
codecs; report it with the stack trace.

### `PROTOCOL_DUPLICATE_CODEC_VERSION`

`Two codecs claim the same protocol version!`

Thrown as `ProtocolCodecErrors.DuplicateCodecVersion`, which extends `Error`.

The codec registry was given two codecs for one protocol version. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_DUPLICATE_PACKET_ID`

`Protocol {protocolVersion} assigns packet id {id} to multiple classes!`

Thrown as `ProtocolCodecErrors.DuplicatePacketId`, which extends `Error`.

A protocol version's packet table gives two packet classes the same id. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_EMPTY_BATCH_PACKET`

`Malformed batch: zero length packet at offset {start}`

Thrown as `ProtocolCodecErrors.EmptyBatchPacket`, which extends `Error`.

A batch holds an empty packet, which the protocol never sends. The connection is dropped; a
modified client, or one that writes the protocol differently than this server reads it, is
the usual cause.

### `PROTOCOL_EMPTY_CODEC_REGISTRY`

`A protocol codec registry requires at least one codec!`

Thrown as `ProtocolCodecErrors.EmptyCodecRegistry`, which extends `Error`.

The protocol codec registry was built with no codecs. This is a bug in the protocol codecs;
report it with the stack trace.

### `PROTOCOL_ENCRYPTED_BATCH_TOO_SHORT`

`An encrypted batch is at least {checksumLength} bytes, got {byteLength}`

Thrown as `ProtocolCodecErrors.EncryptedBatchTooShort`, which extends `Error`.

An encrypted batch is shorter than its checksum, so it is truncated. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

### `PROTOCOL_FRAGMENT_COUNT_MISMATCH`

`Packet and fragment counts differ: {packetsCount} packets, {fragmentsCount} fragments`

Thrown as `ProtocolCodecErrors.FragmentCountMismatch`, which extends `RangeError`.

A batch was encoded with a different number of packets and pre-encoded fragments. This is a
bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_FRAGMENT_WITHOUT_COMPRESSION`

`Full-flush fragments require negotiated compression`

Thrown as `ProtocolCodecErrors.FragmentWithoutCompression`, which extends `Error`.

A batch fragment was encoded before the connection agreed on compression. This is a bug in
the protocol codecs; report it with the stack trace.

### `PROTOCOL_FRAGMENT_WITHOUT_ZLIB`

`Full-flush fragments require zlib compression`

Thrown as `ProtocolCodecErrors.FragmentWithoutZlib`, which extends `Error`.

A batch fragment was encoded for a connection that does not use zlib. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_HANDSHAKE_PACKET_HAS_NO_ID`

`Handshake packet {name} has no id in the base codec!`

Thrown as `ProtocolCodecErrors.HandshakePacketHasNoId`, which extends `Error`.

The base codec lacks one of the four packets the login handshake needs. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_HEIGHTMAP_ROW_WRONG_LENGTH`

`A heightmap row needs {heightMapSide} heights, got {rowCount}`

Thrown as `ProtocolCodecErrors.HeightmapRowWrongLength`, which extends `Error`.

A sub-chunk heightmap row was given the wrong number of heights. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_HEIGHTMAP_WRONG_ROW_COUNT`

`A heightmap needs {heightMapSide} rows, got {heightMapCount}`

Thrown as `ProtocolCodecErrors.HeightmapWrongRowCount`, which extends `Error`.

A sub-chunk heightmap was given the wrong number of rows. This is a bug in the protocol
codecs; report it with the stack trace.

### `PROTOCOL_INVALID_CHUNK_COORDINATES`

`A chunk coordinate pair must have numeric x and z fields`

Thrown as `ProtocolCodecErrors.InvalidChunkCoordinates`, which extends `TypeError`.

A chunk publisher update was given a chunk position without numeric coordinates. This is a
bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_INVALID_ENCRYPTION_KEY`

`An encryption key is 32 bytes, got {byteLength}`

Thrown as `ProtocolCodecErrors.InvalidEncryptionKey`, which extends `Error`.

Encryption was set up with a key that is not 32 bytes. This is a bug in the protocol codecs;
report it with the stack trace.

### `PROTOCOL_ITEM_DATA_CODEC_MISMATCH`

`Item data {protocolVersion} does not match codec {definitionProtocolVersion}!`

Thrown as `ProtocolCodecErrors.ItemDataCodecMismatch`, which extends `Error`.

A codec was given the item table of a different protocol version. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_LEVEL_SETTINGS_NOT_DECODABLE`

`LevelSettings.deserialize is not implemented; decode StartGamePacket instead.`

Thrown as `ProtocolCodecErrors.LevelSettingsNotDecodable`, which extends `Error`.

Level settings were decoded on their own; they are decoded as part of the start game packet.

### `PROTOCOL_MISSING_ACTOR_IDENTIFIERS`

`AvailableActorIdentifiersPacket requires entity identifier data in the packet or protocol context`

Thrown as `ProtocolCodecErrors.MissingActorIdentifiers`, which extends `Error`.

The entity identifier list was sent without its data, and the protocol context had none to
fall back on. This is a bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_MISSING_BIOME_DEFINITIONS`

`BiomeDefinitionListPacket requires biome definition data in the packet or protocol context`

Thrown as `ProtocolCodecErrors.MissingBiomeDefinitions`, which extends `Error`.

The biome definition list was sent without its data, and the protocol context had none to
fall back on. This is a bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_MISSING_COMMAND_SUBCOMMAND_TABLE`

`Command {wireValue} points at missing subcommand table {index}`

Thrown as `ProtocolCodecErrors.MissingCommandSubcommandTable`, which extends `Error`.

A command list refers to a subcommand table it does not hold, so the packet is malformed.

### `PROTOCOL_MISSING_CONSTRAINT_ENUM`

`A constraint points at missing enum {enumSymbol} or value {enumValueSymbol}`

Thrown as `ProtocolCodecErrors.MissingConstraintEnum`, which extends `Error`.

A command list's constraint refers to an enum or value it does not hold, so the packet is
malformed.

### `PROTOCOL_MISSING_ENUM_VALUE`

`Enum {wireValue} points at missing enum value {index}`

Thrown as `ProtocolCodecErrors.MissingEnumValue`, which extends `Error`.

A command list's enum refers to a value it does not hold, so the packet is malformed.

### `PROTOCOL_MISSING_ITEM_DATA`

`Protocol {protocolVersion} requires versioned item data!`

Thrown as `ProtocolCodecErrors.MissingItemData`, which extends `Error`.

A protocol codec was built without the item table its version needs. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_MISSING_JIGSAW_STRUCTURE_DATA`

`JigsawStructureDataPacket requires structure data in the packet or protocol context`

Thrown as `ProtocolCodecErrors.MissingJigsawStructureData`, which extends `Error`.

The jigsaw structure data packet was sent without its data, and the protocol context had none
to fall back on. This is a bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_MISSING_PARAMETER_ENUM`

`Parameter {wireValue} points at missing enum {index}`

Thrown as `ProtocolCodecErrors.MissingParameterEnum`, which extends `Error`.

A command list's parameter refers to an enum it does not hold, so the packet is malformed.

### `PROTOCOL_MISSING_PARAMETER_POSTFIX`

`Parameter {wireValue} points at missing postfix {index}`

Thrown as `ProtocolCodecErrors.MissingParameterPostfix`, which extends `Error`.

A command list's parameter refers to a postfix it does not hold, so the packet is malformed.

### `PROTOCOL_MISSING_PARAMETER_SOFT_ENUM`

`Parameter {wireValue} points at missing soft enum {index}`

Thrown as `ProtocolCodecErrors.MissingParameterSoftEnum`, which extends `Error`.

A command list's parameter refers to a soft enum it does not hold, so the packet is
malformed.

### `PROTOCOL_MISSING_PARAMETER_SUBCOMMAND_TABLE`

`Parameter {wireValue} points at missing subcommand table {index}`

Thrown as `ProtocolCodecErrors.MissingParameterSubcommandTable`, which extends `Error`.

A command list's parameter refers to a subcommand table it does not hold, so the packet is
malformed.

### `PROTOCOL_MISSING_SUBCOMMAND_VALUE`

`Subcommand {wireValue} points at missing value {first}`

Thrown as `ProtocolCodecErrors.MissingSubcommandValue`, which extends `Error`.

A command list's subcommand refers to a value it does not hold, so the packet is malformed.

### `PROTOCOL_MISSING_TRANSACTION_BODY`

`Inventory Transaction has no versioned transaction body`

Thrown as `ProtocolCodecErrors.MissingTransactionBody`, which extends `Error`.

An inventory transaction decoded without the body its protocol version carries. This is a bug
in the protocol codecs; report it with the stack trace.

### `PROTOCOL_NO_READ_BUFFER`

`Cannot decode {name} without a read buffer`

Thrown as `ProtocolCodecErrors.NoReadBuffer`, which extends `Error`.

A packet was decoded before it was given bytes to read. This is a bug in the protocol codecs;
report it with the stack trace.

### `PROTOCOL_NO_RELEASE_CODEC`

`A protocol codec registry requires at least one release codec!`

Thrown as `ProtocolCodecErrors.NoReleaseCodec`, which extends `Error`.

The protocol codec registry was built with preview codecs only. This is a bug in the protocol
codecs; report it with the stack trace.

### `PROTOCOL_NOT_BATCH`

`Not a batch: expected id 0x{batchPacketId}, got 0x{batch}`

Thrown as `ProtocolCodecErrors.NotBatch`, which extends `Error`.

A datagram that should hold a packet batch starts with another id, so the sender does not
speak the Bedrock protocol, or the connection fell out of step.

### `PROTOCOL_NOT_NBT_TAG`

`not an NBT tag: {value}`

Thrown as `ProtocolCodecErrors.NotNbtTag`, which extends `TypeError`.

A packet's NBT field was given a value that is not an NBT tag. This is a bug in the protocol
codecs; report it with the stack trace.

### `PROTOCOL_PACKET_HAS_NO_DATA`

`Cannot serialize packet without data, PID: {id}`

Thrown as `ProtocolCodecErrors.PacketHasNoData`, which extends `Error`.

A packet was encoded before its fields were set. This is a bug in the protocol codecs; report
it with the stack trace.

### `PROTOCOL_PACKET_HAS_NO_DEFAULT_NETWORK_ID`

`Packet {name} has no default network id`

Thrown as `ProtocolCodecErrors.PacketHasNoDefaultNetworkId`, which extends `Error`.

A packet class has no id in the default protocol, so it cannot be sent without a
version-specific codec. This is a bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_PACKET_ID_MISMATCH`

`NetworkPacket ID mismatch: expected {expected}, got {pid}`

Thrown as `ProtocolCodecErrors.PacketIdMismatch`, which extends `Error`.

A packet was decoded by the class for a different packet id. This is a bug in the protocol
codecs; report it with the stack trace.

### `PROTOCOL_PAYLOAD_NOT_DECODABLE`

`Error deserializing packet payload: {e}`

Thrown as `ProtocolCodecErrors.PayloadNotDecodable`, which extends `Error`.

A packet's body could not be decoded. The message ends with what went wrong. The connection
is dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

### `PROTOCOL_SEVERAL_PREVIEW_CODECS`

`Only the newest preview is supported, but codecs {previews} are previews!`

Thrown as `ProtocolCodecErrors.SeveralPreviewCodecs`, which extends `Error`.

The codec registry holds more than one preview protocol; only the newest is kept. This is a
bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_SNAPPY_BLOCK_TOO_LARGE`

`Snappy block expands to {length} bytes, limit is {maxOutputLength}`

Thrown as `ProtocolCodecErrors.SnappyBlockTooLarge`, which extends `Error`.

A Snappy-compressed batch declares more bytes than the server decompresses, which guards
against batches built to exhaust memory. The connection is dropped; a modified client, or one
that writes the protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_SNAPPY_COPY_OUT_OF_RANGE`

`Malformed Snappy block: copy exceeds its output`

Thrown as `ProtocolCodecErrors.SnappyCopyOutOfRange`, which extends `Error`.

A Snappy-compressed batch copies from outside its own output, so it is damaged. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_SNAPPY_LENGTH_MISMATCH`

`Malformed Snappy block: decoded {outputCursor} of {length} bytes`

Thrown as `ProtocolCodecErrors.SnappyLengthMismatch`, which extends `Error`.

A Snappy-compressed batch decompressed to fewer bytes than it declares, so it is truncated.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_SNAPPY_LENGTH_OVERFLOW`

`Malformed Snappy block: length overflows 32 bits`

Thrown as `ProtocolCodecErrors.SnappyLengthOverflow`, which extends `Error`.

A Snappy-compressed batch declares a length too large to be one. The connection is dropped; a
modified client, or one that writes the protocol differently than this server reads it, is
the usual cause.

### `PROTOCOL_SNAPPY_LENGTH_PREFIX_UNTERMINATED`

`Malformed Snappy block: unterminated length prefix`

Thrown as `ProtocolCodecErrors.SnappyLengthPrefixUnterminated`, which extends `Error`.

A Snappy-compressed batch's length header is malformed. The connection is dropped; a modified
client, or one that writes the protocol differently than this server reads it, is the usual
cause.

### `PROTOCOL_SNAPPY_LITERAL_OUT_OF_RANGE`

`Malformed Snappy block: literal exceeds its input or output`

Thrown as `ProtocolCodecErrors.SnappyLiteralOutOfRange`, which extends `Error`.

A Snappy-compressed batch has a literal that runs past its input or its declared length. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_SNAPPY_TRUNCATED_FOUR_BYTE_COPY`

`Malformed Snappy block: truncated 4-byte copy`

Thrown as `ProtocolCodecErrors.SnappyTruncatedFourByteCopy`, which extends `Error`.

A Snappy-compressed batch ends inside a copy instruction. The connection is dropped; a
modified client, or one that writes the protocol differently than this server reads it, is
the usual cause.

### `PROTOCOL_SNAPPY_TRUNCATED_LENGTH_PREFIX`

`Malformed Snappy block: truncated length prefix`

Thrown as `ProtocolCodecErrors.SnappyTruncatedLengthPrefix`, which extends `Error`.

A Snappy-compressed batch ends inside its length header. The connection is dropped; a
modified client, or one that writes the protocol differently than this server reads it, is
the usual cause.

### `PROTOCOL_SNAPPY_TRUNCATED_LITERAL_LENGTH`

`Malformed Snappy block: truncated literal length`

Thrown as `ProtocolCodecErrors.SnappyTruncatedLiteralLength`, which extends `Error`.

A Snappy-compressed batch ends inside a literal's length. The connection is dropped; a
modified client, or one that writes the protocol differently than this server reads it, is
the usual cause.

### `PROTOCOL_SNAPPY_TRUNCATED_ONE_BYTE_COPY`

`Malformed Snappy block: truncated 1-byte copy`

Thrown as `ProtocolCodecErrors.SnappyTruncatedOneByteCopy`, which extends `Error`.

A Snappy-compressed batch ends inside a copy instruction. The connection is dropped; a
modified client, or one that writes the protocol differently than this server reads it, is
the usual cause.

### `PROTOCOL_SNAPPY_TRUNCATED_TWO_BYTE_COPY`

`Malformed Snappy block: truncated 2-byte copy`

Thrown as `ProtocolCodecErrors.SnappyTruncatedTwoByteCopy`, which extends `Error`.

A Snappy-compressed batch ends inside a copy instruction. The connection is dropped; a
modified client, or one that writes the protocol differently than this server reads it, is
the usual cause.

### `PROTOCOL_STALE_PREVIEW_CODEC`

`Preview protocol {protocolVersion} is older than release {advertisedProtocolVersion}; drop it!`

Thrown as `ProtocolCodecErrors.StalePreviewCodec`, which extends `Error`.

The registry holds a preview protocol older than the newest release, which no current preview
client speaks. Drop its codec.

### `PROTOCOL_STRING_ATTRIBUTE_UNSUPPORTED`

`A string attribute needs protocol {protocol2259}; this packet is for {codecProtocol}`

Thrown as `ProtocolCodecErrors.StringAttributeUnsupported`, which extends `Error`.

A text attribute was sent to a client whose protocol has no text attributes. This is a bug in
the protocol codecs; report it with the stack trace.

### `PROTOCOL_UNKNOWN_ATTRIBUTE_PAYLOAD_ALTERNATIVE`

`Unknown attribute payload alternative {type}`

Thrown as `ProtocolCodecErrors.UnknownAttributePayloadAlternative`, which extends `Error`.

An environment attribute's payload type is one the protocol does not define, so the packet is
malformed.

### `PROTOCOL_UNKNOWN_ATTRIBUTE_VALUE_ALTERNATIVE`

`Unknown attribute value alternative {type}`

Thrown as `ProtocolCodecErrors.UnknownAttributeValueAlternative`, which extends `Error`.

An environment attribute's value type is one the protocol does not define, so the packet is
malformed.

### `PROTOCOL_UNKNOWN_DATA_ITEM_PAYLOAD`

`Data item {id} has an unknown type {type}`

Thrown as `ProtocolCodecErrors.UnknownDataItemPayload`, which extends `Error`.

An entity metadata item has a type this protocol does not define, so the packet is malformed.

### `PROTOCOL_UNKNOWN_DATA_STORE_VALUE_TYPE`

`Data store update {dataStoreName}/{property} has an unknown data type {type}`

Thrown as `ProtocolCodecErrors.UnknownDataStoreValueType`, which extends `Error`.

A data store update carries a value type this protocol does not define, so the packet is
malformed.

### `PROTOCOL_UNKNOWN_EASING_FUNCTION_ID`

`Unknown easing_function {easing}`

Thrown as `ProtocolCodecErrors.UnknownEasingFunctionId`, which extends `Error`.

An environment attribute transition names an easing function the protocol does not define, so
the packet is malformed.

### `PROTOCOL_UNKNOWN_ENUM_NAME`

`Unknown {label} "{name}"`

Thrown as `ProtocolCodecErrors.UnknownEnumName`, which extends `Error`.

An environment attribute field names an enum member that does not exist, so the packet is
malformed.

### `PROTOCOL_UNKNOWN_ENUM_VALUE`

`Unknown {label} {value}`

Thrown as `ProtocolCodecErrors.UnknownEnumValue`, which extends `Error`.

An environment attribute field holds a value its enum does not define, so the packet is
malformed.

### `PROTOCOL_UNKNOWN_ITEM_USER_DATA_MARKER`

`Item user data marker {marker} is neither {noTag} nor {tagFollows}`

Thrown as `ProtocolCodecErrors.UnknownItemUserDataMarker`, which extends `Error`.

An item's extra data starts with a marker the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_ITEM_USER_DATA_VERSION`

`Item user data version {version} is not {userDataVersion}`

Thrown as `ProtocolCodecErrors.UnknownItemUserDataVersion`, which extends `Error`.

An item's extra data uses a version the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_PARAMETER_TYPE`

`Parameter {wireValue} carries unknown parse symbol {type}`

Thrown as `ProtocolCodecErrors.UnknownParameterType`, which extends `Error`.

A command list's parameter has an argument type this protocol does not define, so the packet
is malformed.

### `PROTOCOL_UNKNOWN_PRIMITIVE_SHAPE_EXTRA_DATA_ALTERNATIVE`

`Unknown primitive shape extra data alternative {type}`

Thrown as `ProtocolCodecErrors.UnknownPrimitiveShapeExtraDataAlternative`, which extends `Error`.

A debug shape's extra data has a type the protocol does not define, so the packet is
malformed.

### `PROTOCOL_UNSUPPORTED_COMPRESSION_ALGORITHM`

`Unsupported compression algorithm: {algorithm}`

Thrown as `ProtocolCodecErrors.UnsupportedCompressionAlgorithm`, which extends `Error`.

The connection asked for a compression algorithm the protocol does not define. The connection
is dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

## Wire

### `PROTOCOL_ACTOR_FLAGS_TOO_LONG`

`Actor flag bit set runs past {maxFlagBytes} bytes`

Thrown as `ProtocolWireErrors.ActorFlagsTooLong`, which extends `Error`.

A movement prediction packet's entity flags run past the most bytes the protocol uses, so the
packet is malformed. The connection is dropped; a modified client, or one that writes the
protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_ATTRIBUTE_LAYER_NEEDS_NETWORK_STREAM`

`The attribute layer structures need a NetworkBinaryStream`

Thrown as `ProtocolWireErrors.AttributeLayerNeedsNetworkStream`, which extends `TypeError`.

An attribute layer packet was encoded onto a plain binary stream. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_CONNECTION_REQUEST_HAS_TRAILING_BYTES`

`The connection request has {unread} unread bytes after the client data`

Thrown as `ProtocolWireErrors.ConnectionRequestHasTrailingBytes`, which extends `Error`.

A login's connection request has bytes after its client data, so the client wrote a layout
this server does not read. The connection is dropped; a modified client, or one that writes
the protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_DATA_ITEM_TYPE_MISMATCH`

`Data item {id} declares type {selector} but carries type {type}`

Thrown as `ProtocolWireErrors.DataItemTypeMismatch`, which extends `Error`.

An entity metadata item declares one type and carries a value of another. This is a bug in
the protocol codecs; report it with the stack trace.

### `PROTOCOL_DURABILITY_CORRECTION_TOO_LARGE`

`Durability correction {durabilityCorrection} for slot {slot} does not fit an int16`

Thrown as `ProtocolWireErrors.DurabilityCorrectionTooLarge`, which extends `RangeError`.

An item stack response carries a durability correction too large for the field. This is a bug
in the protocol codecs; report it with the stack trace.

### `PROTOCOL_INVALID_ENUM_VALUE_OFFSET`

`Invalid enum value offset {valueOffset}`

Thrown as `ProtocolWireErrors.InvalidEnumValueOffset`, which extends `Error`.

A command enum constraint refers to a value its enum does not hold. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_INVALID_RECIPE_UUID`

`A recipe UUID is sixteen bytes, got {byteLength}`

Thrown as `ProtocolWireErrors.InvalidRecipeUuid`, which extends `Error`.

A recipe id was encoded from a value that is not 16 bytes. This is a bug in the protocol
codecs; report it with the stack trace.

### `PROTOCOL_INVALID_UUID_LENGTH`

`UUID must have 16 bytes`

Thrown as `ProtocolWireErrors.InvalidUuidLength`, which extends `Error`.

A UUID was read from a value that is not 16 bytes. This is a bug in the protocol codecs;
report it with the stack trace.

### `PROTOCOL_JAVA_PACKET_HAS_TRAILING_BYTES`

`{name} has {unread} unread bytes after its fields`

Thrown as `ProtocolWireErrors.JavaPacketHasTrailingBytes`, which extends `Error`.

A Java Edition packet has bytes after the fields this server reads, so the client wrote a
layout this server does not read. The connection is dropped; a client of another release,
or a modified one, is the usual cause.

### `PROTOCOL_JAVA_STRING_TOO_LONG`

`A string of {length} characters is longer than the {max} its field allows`

Thrown as `ProtocolWireErrors.JavaStringTooLong`, which extends `Error`.

A Java Edition client sent a string longer than its field allows, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_MISSING_ATTRIBUTE_LAYER_DATA`

`The payload carries no Data in the {layout} layout of this protocol version`

Thrown as `ProtocolWireErrors.MissingAttributeLayerData`, which extends `TypeError`.

An attribute layer packet was encoded without the data its protocol version carries. This is
a bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_MISSING_PLAYER_LIST_ENTRIES`

`A player list cannot be written without its entries`

Thrown as `ProtocolWireErrors.MissingPlayerListEntries`, which extends `TypeError`.

A player list packet was encoded without its entries. This is a bug in the protocol codecs;
report it with the stack trace.

### `PROTOCOL_MISSING_RELEASE_ITEM_DATA`

`A release-item transaction needs release-item data`

Thrown as `ProtocolWireErrors.MissingReleaseItemData`, which extends `TypeError`.

A release-item transaction was encoded without its data. This is a bug in the protocol
codecs; report it with the stack trace.

### `PROTOCOL_MISSING_SKIN`

`A skin field cannot be written without a skin`

Thrown as `ProtocolWireErrors.MissingSkin`, which extends `TypeError`.

A packet's skin field was encoded without a skin. This is a bug in the protocol codecs;
report it with the stack trace.

### `PROTOCOL_MISSING_TRANSACTION_PAYLOAD`

`An inventory transaction needs its transaction payload`

Thrown as `ProtocolWireErrors.MissingTransactionPayload`, which extends `TypeError`.

An inventory transaction was encoded without its body. This is a bug in the protocol codecs;
report it with the stack trace.

### `PROTOCOL_MISSING_USE_ITEM_DATA`

`A use-item transaction needs use-item data`

Thrown as `ProtocolWireErrors.MissingUseItemData`, which extends `TypeError`.

A use-item transaction was encoded without its data. This is a bug in the protocol codecs;
report it with the stack trace.

### `PROTOCOL_MISSING_USE_ITEM_ON_ENTITY_DATA`

`A use-item-on-entity transaction needs use-item-on-entity data`

Thrown as `ProtocolWireErrors.MissingUseItemOnEntityData`, which extends `TypeError`.

A use-item-on-entity transaction was encoded without its data. This is a bug in the protocol
codecs; report it with the stack trace.

### `PROTOCOL_MISSING_UUID`

`uuid is null or undefined`

Thrown as `ProtocolWireErrors.MissingUuid`, which extends `Error`.

A UUID was parsed from nothing. This is a bug in the protocol codecs; report it with the
stack trace.

### `PROTOCOL_NO_LAYOUT_AT_PROTOCOL`

`{name}.{key} has no layout at protocol {protocolVersion}`

Thrown as `ProtocolWireErrors.NoLayoutAtProtocol`, which extends `Error`.

A packet field has no wire layout for this protocol version, so the packet cannot be written
or read at it. This is a bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_PLAYER_LIST_ENTRY_HAS_NO_SKIN`

`Player list entry {uUID} has no skin, so it cannot be added`

Thrown as `ProtocolWireErrors.PlayerListEntryHasNoSkin`, which extends `Error`.

A player was added to the player list before their skin was known. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_PLAYER_LOCATION_TYPE_MISMATCH`

`Player location selector {selector} does not match type {packetType}`

Thrown as `ProtocolWireErrors.PlayerLocationTypeMismatch`, which extends `Error`.

A player location packet's type and body disagree, so the packet is malformed. The connection
is dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

### `PROTOCOL_SOUND_DATA_TYPE_MISMATCH`

`Sound data update selector {type} does not match its type {tag}`

Thrown as `ProtocolWireErrors.SoundDataTypeMismatch`, which extends `Error`.

A sound data update's type and body disagree, so the packet is malformed. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

### `PROTOCOL_TOO_MANY_BLOCK_ACTIONS`

`PlayerAuthInput claims {actionCount} block actions; the docs allow {maxBlockActions}`

Thrown as `ProtocolWireErrors.TooManyBlockActions`, which extends `RangeError`.

A client's input packet lists more block actions than the protocol allows. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

### `PROTOCOL_TOO_MANY_INPUT_FLAGS`

`PlayerAuthInput claims {flagCount} input flags; there are {inputFlagCount}`

Thrown as `ProtocolWireErrors.TooManyInputFlags`, which extends `RangeError`.

A client's input packet claims more input flags than the protocol defines. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

### `PROTOCOL_TOO_MANY_ITEM_STACK_ACTIONS`

`Item stack request {requestId} names {actionCount} actions; the docs allow at most {maxRequestActions}`

Thrown as `ProtocolWireErrors.TooManyItemStackActions`, which extends `RangeError`.

A client's item stack request lists more actions than the protocol allows. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

### `PROTOCOL_TOO_MANY_ITEM_STACK_REQUESTS`

`An item stack request packet names {count} requests; the docs allow at most {maxRequests}`

Thrown as `ProtocolWireErrors.TooManyItemStackRequests`, which extends `RangeError`.

A client's item stack request packet lists more requests than the protocol allows. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_TOO_MANY_ITEM_USE_ACTIONS`

`A PlayerAuthInput item use carried {actionCount} actions; the docs allow {maxInventoryActions}`

Thrown as `ProtocolWireErrors.TooManyItemUseActions`, which extends `RangeError`.

A client's input packet carries an item use with more actions than the protocol allows. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_TOO_MANY_MAP_PIXELS`

`MapInfoRequest claims {count} client pixels; the limit is {maxClientPixels}`

Thrown as `ProtocolWireErrors.TooManyMapPixels`, which extends `Error`.

A client's map info request lists more pixels than the protocol allows. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

### `PROTOCOL_TOO_MANY_TRANSACTION_ACTIONS`

`An inventory transaction carried {actionsCount} actions; the docs allow {maxInventoryActions}`

Thrown as `ProtocolWireErrors.TooManyTransactionActions`, which extends `RangeError`.

A client's inventory transaction lists more actions than the protocol allows, which guards
against packets built to exhaust memory. The connection is dropped; a modified client, or one
that writes the protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_UNDEFINED_SUB_CHUNK_RESULT_UNSUPPORTED`

`SubChunkRequestResult.UNDEFINED is unavailable before protocol 2207`

Thrown as `ProtocolWireErrors.UndefinedSubChunkResultUnsupported`, which extends `RangeError`.

A sub-chunk result was sent to a client whose protocol has no `UNDEFINED` result. This is a
bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_UNKNOWN_ACTOR_LINK_TYPE`

`Actor link {targetA} -> {targetB} carries unknown link type {type}`

Thrown as `ProtocolWireErrors.UnknownActorLinkType`, which extends `Error`.

An entity link has a link type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_ATTRIBUTE_LAYER_DATA_TYPE`

`Unknown ClientboundAttributeLayerSyncPacket data variant {type}`

Thrown as `ProtocolWireErrors.UnknownAttributeLayerDataType`, which extends `Error`.

An attribute layer packet has a data type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_BOOK_EDIT_ACTION`

`Unknown book edit action {action}`

Thrown as `ProtocolWireErrors.UnknownBookEditAction`, which extends `Error`.

A book edit has an action the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_COMMAND_BLOCK_TARGET_ALTERNATIVE`

`Unknown command block target alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownCommandBlockTargetAlternative`, which extends `Error`.

A command block update targets something the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_DATA_ITEM_TYPE`

`Data item {id} carries unknown type {selector}`

Thrown as `ProtocolWireErrors.UnknownDataItemType`, which extends `Error`.

An entity metadata item has a type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_DATA_STORE_ENTRY_TYPE`

`Data store entry has an unknown type {type}`

Thrown as `ProtocolWireErrors.UnknownDataStoreEntryType`, which extends `Error`.

A data store entry has a type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_DATA_STORE_PROPERTY_TYPE`

`Data store property value has an unknown type {type}`

Thrown as `ProtocolWireErrors.UnknownDataStorePropertyType`, which extends `Error`.

A data store property has a value type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_DATA_STORE_UPDATE_TYPE`

`Data store update has an unknown data type {type}`

Thrown as `ProtocolWireErrors.UnknownDataStoreUpdateType`, which extends `Error`.

A data store update has a value type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_EASING_FUNCTION`

`Unknown easing_function "{name}"`

Thrown as `ProtocolWireErrors.UnknownEasingFunction`, which extends `Error`.

A camera instruction names an easing function the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_ENTITY_OVERRIDE_UPDATE_TYPE`

`Unknown entity override update type {type}`

Thrown as `ProtocolWireErrors.UnknownEntityOverrideUpdateType`, which extends `Error`.

An entity override update has a type the protocol does not define. This is a bug in the
protocol codecs; report it with the stack trace.

### `PROTOCOL_UNKNOWN_GAME_RULE_TYPE`

`Game rule {name} has an unknown value type {type}`

Thrown as `ProtocolWireErrors.UnknownGameRuleType`, which extends `Error`.

A game rule in the start game packet has a value type the protocol does not define. This is a
bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_UNKNOWN_GAME_RULE_VALUE_ALTERNATIVE`

`Unknown game rule value alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownGameRuleValueAlternative`, which extends `Error`.

A game rule has a value type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_ITEM_DESCRIPTOR_KIND`

`Unknown item descriptor kind {kind} in an item stack request`

Thrown as `ProtocolWireErrors.UnknownItemDescriptorKind`, which extends `Error`.

An item stack request names an item with a descriptor kind the protocol does not define, so
the packet is malformed. The connection is dropped; a modified client, or one that writes the
protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_ITEM_STACK_REQUEST_ACTION_TYPE`

`Unknown item stack request action type {type}`

Thrown as `ProtocolWireErrors.UnknownItemStackRequestActionType`, which extends `Error`.

An item stack request has an action the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_MUSIC_PLAYBACK_STATE`

`Unknown MusicPlaybackState "{value}"`

Thrown as `ProtocolWireErrors.UnknownMusicPlaybackState`, which extends `Error`.

A music packet names a playback state the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_PACK_SETTING_VALUE_ALTERNATIVE`

`Unknown pack setting value alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownPackSettingValueAlternative`, which extends `Error`.

A pack setting change has a value type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_PARTY_DESTINATION_COOKIE_INTENT`

`Unknown party destination cookie intent "{name}"`

Thrown as `ProtocolWireErrors.UnknownPartyDestinationCookieIntent`, which extends `Error`.

A party destination cookie names an intent the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_PLAYER_LOCATION_ALTERNATIVE`

`Unknown player location alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownPlayerLocationAlternative`, which extends `Error`.

A player location packet has a type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_RECIPE_INGREDIENT_DESCRIPTOR`

`Unknown recipe ingredient descriptor {name}`

Thrown as `ProtocolWireErrors.UnknownRecipeIngredientDescriptor`, which extends `Error`.

A recipe ingredient uses a descriptor the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_RECIPE_INGREDIENT_DESCRIPTOR_VARIANT`

`Unknown recipe ingredient descriptor variant {variant}`

Thrown as `ProtocolWireErrors.UnknownRecipeIngredientDescriptorVariant`, which extends `Error`.

A recipe ingredient uses a descriptor variant the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_RESOURCE_PACK_RESPONSE_ALTERNATIVE`

`Unknown resource pack response alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownResourcePackResponseAlternative`, which extends `Error`.

A client answered the resource pack offer with a status the protocol does not define, so the
packet is malformed. The connection is dropped; a modified client, or one that writes the
protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_RESOURCE_PACK_STATUS`

`No resource pack response alternative for status {status}`

Thrown as `ProtocolWireErrors.UnknownResourcePackStatus`, which extends `Error`.

A resource pack response was encoded with a status the protocol does not define. This is a
bug in the protocol codecs; report it with the stack trace.

### `PROTOCOL_UNKNOWN_SCREEN_CLOSE_REASON`

`Unknown DataDrivenScreenClosedReason "{value}"`

Thrown as `ProtocolWireErrors.UnknownScreenCloseReason`, which extends `Error`.

A client closed a data-driven screen with a reason the protocol does not define, so the
packet is malformed. The connection is dropped; a modified client, or one that writes the
protocol differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_SET_SCORE_ALTERNATIVE`

`Unknown set score alternative {action}`

Thrown as `ProtocolWireErrors.UnknownSetScoreAlternative`, which extends `Error`.

A scoreboard update has an action the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_SOFT_ENUM_UPDATE_TYPE`

`Unknown soft enum update type {type}`

Thrown as `ProtocolWireErrors.UnknownSoftEnumUpdateType`, which extends `Error`.

A command soft enum update has a type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_SOUND_DATA_UPDATE_ALTERNATIVE`

`Unknown sound data update alternative {type}`

Thrown as `ProtocolWireErrors.UnknownSoundDataUpdateAlternative`, which extends `Error`.

A sound data update has a type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_SUB_CHUNK_REQUEST_RESULT`

`Unknown sub chunk request result {result}`

Thrown as `ProtocolWireErrors.UnknownSubChunkRequestResult`, which extends `RangeError`.

A sub-chunk response has a result code the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_TELEMETRY_EVENT_DATA_ALTERNATIVE`

`Unknown telemetry event data alternative {ordinal}`

Thrown as `ProtocolWireErrors.UnknownTelemetryEventDataAlternative`, which extends `Error`.

A telemetry event has a data type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_TEXT_BODY_TYPE`

`Unknown TextPacket body variant {variant}`

Thrown as `ProtocolWireErrors.UnknownTextBodyType`, which extends `Error`.

A chat packet has a body type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_TRANSACTION_TYPE`

`Unknown transaction type {transactionType}`

Thrown as `ProtocolWireErrors.UnknownTransactionType`, which extends `TypeError`.

An inventory transaction has a type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_UNKNOWN_WORLD_CLOCK_DATA_TYPE`

`Unknown SyncWorldClocksPacket data type {type}`

Thrown as `ProtocolWireErrors.UnknownWorldClockDataType`, which extends `Error`.

A world clock sync has a data type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

### `PROTOCOL_USE_ITEM_TRANSACTION_HAS_TRAILING_BYTES`

`UseItem transaction left {byteLength} bytes unread: the packet layout does not match the client's`

Thrown as `ProtocolWireErrors.UseItemTransactionHasTrailingBytes`, which extends `Error`.

A client's use-item transaction is longer than this server's layout of it, so the client
writes a newer or different layout. The connection is dropped; a modified client, or one that
writes the protocol differently than this server reads it, is the usual cause.
<!-- /fact -->
