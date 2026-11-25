---
title: '@jsprismarine/protocol wire errors'
description: The code, message and meaning of every error in the wire catalog of @jsprismarine/protocol.
group: Documents
category: Errors
---

# @jsprismarine/protocol wire errors

These are the errors in the `wire` catalog of `@jsprismarine/protocol`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../protocol.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.protocol.wire -->
## `PROTOCOL_ACTOR_FLAGS_TOO_LONG`

`Actor flag bit set runs past {maxFlagBytes} bytes`

Thrown as `ProtocolWireErrors.ActorFlagsTooLong`, which extends `Error`.

A movement prediction packet's entity flags run past the most bytes the protocol uses, so the
packet is malformed. The connection is dropped; a modified client, or one that writes the
protocol differently than this server reads it, is the usual cause.

## `PROTOCOL_ATTRIBUTE_LAYER_NEEDS_NETWORK_STREAM`

`The attribute layer structures need a NetworkBinaryStream`

Thrown as `ProtocolWireErrors.AttributeLayerNeedsNetworkStream`, which extends `TypeError`.

An attribute layer packet was encoded onto a plain binary stream. This is a bug in the
protocol codecs; report it with the stack trace.

## `PROTOCOL_CONNECTION_REQUEST_HAS_TRAILING_BYTES`

`The connection request has {unread} unread bytes after the client data`

Thrown as `ProtocolWireErrors.ConnectionRequestHasTrailingBytes`, which extends `Error`.

A login's connection request has bytes after its client data, so the client wrote a layout
this server does not read. The connection is dropped; a modified client, or one that writes
the protocol differently than this server reads it, is the usual cause.

## `PROTOCOL_DATA_ITEM_TYPE_MISMATCH`

`Data item {id} declares type {selector} but carries type {type}`

Thrown as `ProtocolWireErrors.DataItemTypeMismatch`, which extends `Error`.

An entity metadata item declares one type and carries a value of another. This is a bug in
the protocol codecs; report it with the stack trace.

## `PROTOCOL_DURABILITY_CORRECTION_TOO_LARGE`

`Durability correction {durabilityCorrection} for slot {slot} does not fit an int16`

Thrown as `ProtocolWireErrors.DurabilityCorrectionTooLarge`, which extends `RangeError`.

An item stack response carries a durability correction too large for the field. This is a bug
in the protocol codecs; report it with the stack trace.

## `PROTOCOL_INVALID_ENUM_VALUE_OFFSET`

`Invalid enum value offset {valueOffset}`

Thrown as `ProtocolWireErrors.InvalidEnumValueOffset`, which extends `Error`.

A command enum constraint refers to a value its enum does not hold. This is a bug in the
protocol codecs; report it with the stack trace.

## `PROTOCOL_INVALID_RECIPE_UUID`

`A recipe UUID is sixteen bytes, got {byteLength}`

Thrown as `ProtocolWireErrors.InvalidRecipeUuid`, which extends `Error`.

A recipe id was encoded from a value that is not 16 bytes. This is a bug in the protocol
codecs; report it with the stack trace.

## `PROTOCOL_INVALID_UUID_LENGTH`

`UUID must have 16 bytes`

Thrown as `ProtocolWireErrors.InvalidUuidLength`, which extends `Error`.

A UUID was read from a value that is not 16 bytes. This is a bug in the protocol codecs;
report it with the stack trace.

## `PROTOCOL_JAVA_BLOCK_STATE_ROW_MALFORMED`

`Block state row {index} is not [name, firstId, properties]`

Thrown as `ProtocolWireErrors.JavaBlockStateRowMalformed`, which extends `Error`.

A release's generated `blockStates.json` has a row that is not a block name, a first state id
and a list of properties. Regenerate it with `pnpm --filter

## `PROTOCOL_JAVA_CHUNK_HAS_BLOCK_ENTITIES`

`A chunk carries {count} block entities, which this server does not read`

Thrown as `ProtocolWireErrors.JavaChunkHasBlockEntities`, which extends `Error`.

A Java Edition chunk carries block entities, which this server's chunk reader does not read
yet. Seen when reading another server's chunk.

## `PROTOCOL_JAVA_ENTITY_DATA_SERIALIZER_UNREAD`

`An entity data entry uses serializer {serializer}, which this server does not read`

Thrown as `ProtocolWireErrors.JavaEntityDataSerializerUnread`, which extends `Error`.

A Java Edition entity data entry uses a serializer this server's reader does not read: it
sends the shared flags and the pose only. Seen when reading another server's entity data.

## `PROTOCOL_JAVA_FRAME_LENGTH_OUT_OF_RANGE`

`A compressed frame names {length} bytes, outside what threshold {threshold} allows`

Thrown as `ProtocolWireErrors.JavaFrameLengthOutOfRange`, which extends `Error`.

A Java Edition client's compressed frame names an uncompressed length below the compression
threshold, past the 8 MiB limit, or other than what its body inflates to. The server closes
the connection; a modified client is the usual cause.

## `PROTOCOL_JAVA_ITEM_COMPONENTS_UNREAD`

`An item stack carries {count} data components, which this server does not read`

Thrown as `ProtocolWireErrors.JavaItemComponentsUnread`, which extends `Error`.

A Java Edition item stack the server sent carries data components, which this server's
reader does not read: it sends plain stacks. Seen when reading another server's inventory.

## `PROTOCOL_JAVA_PACKET_HAS_TRAILING_BYTES`

`{name} has {unread} unread bytes after its fields`

Thrown as `ProtocolWireErrors.JavaPacketHasTrailingBytes`, which extends `Error`.

A Java Edition packet has bytes after the fields this server reads, so the client wrote a
layout this server does not read. The connection is dropped; a client of another release,
or a modified one, is the usual cause.

## `PROTOCOL_JAVA_PACKET_NOT_IN_RELEASE`

`Java Edition {release} has no {name} packet`

Thrown as `ProtocolWireErrors.JavaPacketNotInRelease`, which extends `Error`.

A Java Edition packet was sent or read on a connection whose release has no such packet. This
is a bug in the server's Java handling, which should only use the packets the connection's
release lists; report it with the stack trace.

## `PROTOCOL_JAVA_PALETTED_CONTAINER_BITS`

`A paletted container of {entries} entries cannot use {bits} bits per entry`

Thrown as `ProtocolWireErrors.JavaPalettedContainerBits`, which extends `Error`.

A Java Edition paletted container names a bits per entry its kind never uses, so the chunk
or the packet carrying it is malformed. Seen when reading another server's chunk.

## `PROTOCOL_JAVA_REGISTRY_ENTRY_HAS_DATA`

`A registry entry carries data, which this server does not read`

Thrown as `ProtocolWireErrors.JavaRegistryEntryHasData`, which extends `Error`.

A registry entry carried its data, which this server does not read: it lists only entries of
packs the client has. Seen when reading another server's configuration without the known
packs exchange.

## `PROTOCOL_JAVA_STRING_TOO_LONG`

`A string of {length} characters is longer than the {max} its field allows`

Thrown as `ProtocolWireErrors.JavaStringTooLong`, which extends `Error`.

A Java Edition client sent a string longer than its field allows, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_JAVA_TEXT_COMPONENT_NOT_STRING`

`A text component with NBT tag {tag} is not plain text`

Thrown as `ProtocolWireErrors.JavaTextComponentNotString`, which extends `Error`.

A Java Edition client sent a text component that is not plain text, which the server does
not read yet. The connection is dropped.

## `PROTOCOL_JAVA_VELOCITY_NOT_AT_REST`

`A spawned entity carries a velocity, which this server does not read`

Thrown as `ProtocolWireErrors.JavaVelocityNotAtRest`, which extends `Error`.

A Java Edition entity spawn carries a velocity, which this server's reader does not read: it
sends entities at rest. Seen when reading another server's spawn.

## `PROTOCOL_MISSING_ATTRIBUTE_LAYER_DATA`

`The payload carries no Data in the {layout} layout of this protocol version`

Thrown as `ProtocolWireErrors.MissingAttributeLayerData`, which extends `TypeError`.

An attribute layer packet was encoded without the data its protocol version carries. This is
a bug in the protocol codecs; report it with the stack trace.

## `PROTOCOL_MISSING_PLAYER_LIST_ENTRIES`

`A player list cannot be written without its entries`

Thrown as `ProtocolWireErrors.MissingPlayerListEntries`, which extends `TypeError`.

A player list packet was encoded without its entries. This is a bug in the protocol codecs;
report it with the stack trace.

## `PROTOCOL_MISSING_RELEASE_ITEM_DATA`

`A release-item transaction needs release-item data`

Thrown as `ProtocolWireErrors.MissingReleaseItemData`, which extends `TypeError`.

A release-item transaction was encoded without its data. This is a bug in the protocol
codecs; report it with the stack trace.

## `PROTOCOL_MISSING_SKIN`

`A skin field cannot be written without a skin`

Thrown as `ProtocolWireErrors.MissingSkin`, which extends `TypeError`.

A packet's skin field was encoded without a skin. This is a bug in the protocol codecs;
report it with the stack trace.

## `PROTOCOL_MISSING_TRANSACTION_PAYLOAD`

`An inventory transaction needs its transaction payload`

Thrown as `ProtocolWireErrors.MissingTransactionPayload`, which extends `TypeError`.

An inventory transaction was encoded without its body. This is a bug in the protocol codecs;
report it with the stack trace.

## `PROTOCOL_MISSING_USE_ITEM_DATA`

`A use-item transaction needs use-item data`

Thrown as `ProtocolWireErrors.MissingUseItemData`, which extends `TypeError`.

A use-item transaction was encoded without its data. This is a bug in the protocol codecs;
report it with the stack trace.

## `PROTOCOL_MISSING_USE_ITEM_ON_ENTITY_DATA`

`A use-item-on-entity transaction needs use-item-on-entity data`

Thrown as `ProtocolWireErrors.MissingUseItemOnEntityData`, which extends `TypeError`.

A use-item-on-entity transaction was encoded without its data. This is a bug in the protocol
codecs; report it with the stack trace.

## `PROTOCOL_MISSING_UUID`

`uuid is null or undefined`

Thrown as `ProtocolWireErrors.MissingUuid`, which extends `Error`.

A UUID was parsed from nothing. This is a bug in the protocol codecs; report it with the
stack trace.

## `PROTOCOL_NO_LAYOUT_AT_PROTOCOL`

`{name}.{key} has no layout at protocol {protocolVersion}`

Thrown as `ProtocolWireErrors.NoLayoutAtProtocol`, which extends `Error`.

A packet field has no wire layout for this protocol version, so the packet cannot be written
or read at it. This is a bug in the protocol codecs; report it with the stack trace.

## `PROTOCOL_PLAYER_LIST_ENTRY_HAS_NO_SKIN`

`Player list entry {uUID} has no skin, so it cannot be added`

Thrown as `ProtocolWireErrors.PlayerListEntryHasNoSkin`, which extends `Error`.

A player was added to the player list before their skin was known. This is a bug in the
protocol codecs; report it with the stack trace.

## `PROTOCOL_PLAYER_LOCATION_TYPE_MISMATCH`

`Player location selector {selector} does not match type {packetType}`

Thrown as `ProtocolWireErrors.PlayerLocationTypeMismatch`, which extends `Error`.

A player location packet's type and body disagree, so the packet is malformed. The connection
is dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

## `PROTOCOL_SOUND_DATA_TYPE_MISMATCH`

`Sound data update selector {type} does not match its type {tag}`

Thrown as `ProtocolWireErrors.SoundDataTypeMismatch`, which extends `Error`.

A sound data update's type and body disagree, so the packet is malformed. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

## `PROTOCOL_TOO_MANY_BLOCK_ACTIONS`

`PlayerAuthInput claims {actionCount} block actions; the docs allow {maxBlockActions}`

Thrown as `ProtocolWireErrors.TooManyBlockActions`, which extends `RangeError`.

A client's input packet lists more block actions than the protocol allows. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

## `PROTOCOL_TOO_MANY_INPUT_FLAGS`

`PlayerAuthInput claims {flagCount} input flags; there are {inputFlagCount}`

Thrown as `ProtocolWireErrors.TooManyInputFlags`, which extends `RangeError`.

A client's input packet claims more input flags than the protocol defines. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

## `PROTOCOL_TOO_MANY_ITEM_STACK_ACTIONS`

`Item stack request {requestId} names {actionCount} actions; the docs allow at most {maxRequestActions}`

Thrown as `ProtocolWireErrors.TooManyItemStackActions`, which extends `RangeError`.

A client's item stack request lists more actions than the protocol allows. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

## `PROTOCOL_TOO_MANY_ITEM_STACK_REQUESTS`

`An item stack request packet names {count} requests; the docs allow at most {maxRequests}`

Thrown as `ProtocolWireErrors.TooManyItemStackRequests`, which extends `RangeError`.

A client's item stack request packet lists more requests than the protocol allows. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

## `PROTOCOL_TOO_MANY_ITEM_USE_ACTIONS`

`A PlayerAuthInput item use carried {actionCount} actions; the docs allow {maxInventoryActions}`

Thrown as `ProtocolWireErrors.TooManyItemUseActions`, which extends `RangeError`.

A client's input packet carries an item use with more actions than the protocol allows. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

## `PROTOCOL_TOO_MANY_MAP_PIXELS`

`MapInfoRequest claims {count} client pixels; the limit is {maxClientPixels}`

Thrown as `ProtocolWireErrors.TooManyMapPixels`, which extends `Error`.

A client's map info request lists more pixels than the protocol allows. The connection is
dropped; a modified client, or one that writes the protocol differently than this server
reads it, is the usual cause.

## `PROTOCOL_TOO_MANY_TRANSACTION_ACTIONS`

`An inventory transaction carried {actionsCount} actions; the docs allow {maxInventoryActions}`

Thrown as `ProtocolWireErrors.TooManyTransactionActions`, which extends `RangeError`.

A client's inventory transaction lists more actions than the protocol allows, which guards
against packets built to exhaust memory. The connection is dropped; a modified client, or one
that writes the protocol differently than this server reads it, is the usual cause.

## `PROTOCOL_UNDEFINED_SUB_CHUNK_RESULT_UNSUPPORTED`

`SubChunkRequestResult.UNDEFINED is unavailable before protocol 2207`

Thrown as `ProtocolWireErrors.UndefinedSubChunkResultUnsupported`, which extends `RangeError`.

A sub-chunk result was sent to a client whose protocol has no `UNDEFINED` result. This is a
bug in the protocol codecs; report it with the stack trace.

## `PROTOCOL_UNKNOWN_ACTOR_LINK_TYPE`

`Actor link {targetA} -> {targetB} carries unknown link type {type}`

Thrown as `ProtocolWireErrors.UnknownActorLinkType`, which extends `Error`.

An entity link has a link type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_ATTRIBUTE_LAYER_DATA_TYPE`

`Unknown ClientboundAttributeLayerSyncPacket data variant {type}`

Thrown as `ProtocolWireErrors.UnknownAttributeLayerDataType`, which extends `Error`.

An attribute layer packet has a data type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_BOOK_EDIT_ACTION`

`Unknown book edit action {action}`

Thrown as `ProtocolWireErrors.UnknownBookEditAction`, which extends `Error`.

A book edit has an action the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_COMMAND_BLOCK_TARGET_ALTERNATIVE`

`Unknown command block target alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownCommandBlockTargetAlternative`, which extends `Error`.

A command block update targets something the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_DATA_ITEM_TYPE`

`Data item {id} carries unknown type {selector}`

Thrown as `ProtocolWireErrors.UnknownDataItemType`, which extends `Error`.

An entity metadata item has a type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_DATA_STORE_ENTRY_TYPE`

`Data store entry has an unknown type {type}`

Thrown as `ProtocolWireErrors.UnknownDataStoreEntryType`, which extends `Error`.

A data store entry has a type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_DATA_STORE_PROPERTY_TYPE`

`Data store property value has an unknown type {type}`

Thrown as `ProtocolWireErrors.UnknownDataStorePropertyType`, which extends `Error`.

A data store property has a value type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_DATA_STORE_UPDATE_TYPE`

`Data store update has an unknown data type {type}`

Thrown as `ProtocolWireErrors.UnknownDataStoreUpdateType`, which extends `Error`.

A data store update has a value type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_EASING_FUNCTION`

`Unknown easing_function "{name}"`

Thrown as `ProtocolWireErrors.UnknownEasingFunction`, which extends `Error`.

A camera instruction names an easing function the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_ENTITY_OVERRIDE_UPDATE_TYPE`

`Unknown entity override update type {type}`

Thrown as `ProtocolWireErrors.UnknownEntityOverrideUpdateType`, which extends `Error`.

An entity override update has a type the protocol does not define. This is a bug in the
protocol codecs; report it with the stack trace.

## `PROTOCOL_UNKNOWN_GAME_RULE_TYPE`

`Game rule {name} has an unknown value type {type}`

Thrown as `ProtocolWireErrors.UnknownGameRuleType`, which extends `Error`.

A game rule in the start game packet has a value type the protocol does not define. This is a
bug in the protocol codecs; report it with the stack trace.

## `PROTOCOL_UNKNOWN_GAME_RULE_VALUE_ALTERNATIVE`

`Unknown game rule value alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownGameRuleValueAlternative`, which extends `Error`.

A game rule has a value type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_ITEM_DESCRIPTOR_KIND`

`Unknown item descriptor kind {kind} in an item stack request`

Thrown as `ProtocolWireErrors.UnknownItemDescriptorKind`, which extends `Error`.

An item stack request names an item with a descriptor kind the protocol does not define, so
the packet is malformed. The connection is dropped; a modified client, or one that writes the
protocol differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_ITEM_STACK_REQUEST_ACTION_TYPE`

`Unknown item stack request action type {type}`

Thrown as `ProtocolWireErrors.UnknownItemStackRequestActionType`, which extends `Error`.

An item stack request has an action the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_MUSIC_PLAYBACK_STATE`

`Unknown MusicPlaybackState "{value}"`

Thrown as `ProtocolWireErrors.UnknownMusicPlaybackState`, which extends `Error`.

A music packet names a playback state the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_PACK_SETTING_VALUE_ALTERNATIVE`

`Unknown pack setting value alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownPackSettingValueAlternative`, which extends `Error`.

A pack setting change has a value type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_PARTY_DESTINATION_COOKIE_INTENT`

`Unknown party destination cookie intent "{name}"`

Thrown as `ProtocolWireErrors.UnknownPartyDestinationCookieIntent`, which extends `Error`.

A party destination cookie names an intent the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_PLAYER_LOCATION_ALTERNATIVE`

`Unknown player location alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownPlayerLocationAlternative`, which extends `Error`.

A player location packet has a type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_RECIPE_INGREDIENT_DESCRIPTOR`

`Unknown recipe ingredient descriptor {name}`

Thrown as `ProtocolWireErrors.UnknownRecipeIngredientDescriptor`, which extends `Error`.

A recipe ingredient uses a descriptor the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_RECIPE_INGREDIENT_DESCRIPTOR_VARIANT`

`Unknown recipe ingredient descriptor variant {variant}`

Thrown as `ProtocolWireErrors.UnknownRecipeIngredientDescriptorVariant`, which extends `Error`.

A recipe ingredient uses a descriptor variant the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_RESOURCE_PACK_RESPONSE_ALTERNATIVE`

`Unknown resource pack response alternative {selector}`

Thrown as `ProtocolWireErrors.UnknownResourcePackResponseAlternative`, which extends `Error`.

A client answered the resource pack offer with a status the protocol does not define, so the
packet is malformed. The connection is dropped; a modified client, or one that writes the
protocol differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_RESOURCE_PACK_STATUS`

`No resource pack response alternative for status {status}`

Thrown as `ProtocolWireErrors.UnknownResourcePackStatus`, which extends `Error`.

A resource pack response was encoded with a status the protocol does not define. This is a
bug in the protocol codecs; report it with the stack trace.

## `PROTOCOL_UNKNOWN_SCREEN_CLOSE_REASON`

`Unknown DataDrivenScreenClosedReason "{value}"`

Thrown as `ProtocolWireErrors.UnknownScreenCloseReason`, which extends `Error`.

A client closed a data-driven screen with a reason the protocol does not define, so the
packet is malformed. The connection is dropped; a modified client, or one that writes the
protocol differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_SET_SCORE_ALTERNATIVE`

`Unknown set score alternative {action}`

Thrown as `ProtocolWireErrors.UnknownSetScoreAlternative`, which extends `Error`.

A scoreboard update has an action the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_SOFT_ENUM_UPDATE_TYPE`

`Unknown soft enum update type {type}`

Thrown as `ProtocolWireErrors.UnknownSoftEnumUpdateType`, which extends `Error`.

A command soft enum update has a type the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_SOUND_DATA_UPDATE_ALTERNATIVE`

`Unknown sound data update alternative {type}`

Thrown as `ProtocolWireErrors.UnknownSoundDataUpdateAlternative`, which extends `Error`.

A sound data update has a type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_SUB_CHUNK_REQUEST_RESULT`

`Unknown sub chunk request result {result}`

Thrown as `ProtocolWireErrors.UnknownSubChunkRequestResult`, which extends `RangeError`.

A sub-chunk response has a result code the protocol does not define, so the packet is
malformed. The connection is dropped; a modified client, or one that writes the protocol
differently than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_TELEMETRY_EVENT_DATA_ALTERNATIVE`

`Unknown telemetry event data alternative {ordinal}`

Thrown as `ProtocolWireErrors.UnknownTelemetryEventDataAlternative`, which extends `Error`.

A telemetry event has a data type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_TEXT_BODY_TYPE`

`Unknown TextPacket body variant {variant}`

Thrown as `ProtocolWireErrors.UnknownTextBodyType`, which extends `Error`.

A chat packet has a body type the protocol does not define, so the packet is malformed. The
connection is dropped; a modified client, or one that writes the protocol differently than
this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_TRANSACTION_TYPE`

`Unknown transaction type {transactionType}`

Thrown as `ProtocolWireErrors.UnknownTransactionType`, which extends `TypeError`.

An inventory transaction has a type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

## `PROTOCOL_UNKNOWN_WORLD_CLOCK_DATA_TYPE`

`Unknown SyncWorldClocksPacket data type {type}`

Thrown as `ProtocolWireErrors.UnknownWorldClockDataType`, which extends `Error`.

A world clock sync has a data type the protocol does not define, so the packet is malformed.
The connection is dropped; a modified client, or one that writes the protocol differently
than this server reads it, is the usual cause.

## `PROTOCOL_USE_ITEM_TRANSACTION_HAS_TRAILING_BYTES`

`UseItem transaction left {byteLength} bytes unread: the packet layout does not match the client's`

Thrown as `ProtocolWireErrors.UseItemTransactionHasTrailingBytes`, which extends `Error`.

A client's use-item transaction is longer than this server's layout of it, so the client
writes a newer or different layout. The connection is dropped; a modified client, or one that
writes the protocol differently than this server reads it, is the usual cause.
<!-- /fact -->
