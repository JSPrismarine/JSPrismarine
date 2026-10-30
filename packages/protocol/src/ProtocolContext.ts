/** One row in the item table a negotiated Bedrock protocol uses. */
export interface ProtocolItemTableEntry {
    /** The number the client associates with this item name; negative for a block item. */
    readonly runtime_id: number;
    /** Whether the item is defined by components rather than by the client's built-in table. */
    readonly component_based: boolean;
    /** The `ItemVersion` value sent in `ItemRegistryPacket`. */
    readonly version: number;
}

/** Item names, wire numbers, and captured component compounds for one protocol version. */
export interface ProtocolItemData {
    /** The protocol version this captured item data belongs to. */
    readonly protocolVersion: number;
    /** Item identifier to the exact row sent for it in `ItemRegistryPacket`. */
    readonly table: Readonly<Record<string, ProtocolItemTableEntry>>;
    /** Item identifier to its network-NBT `Item Component Data`, already encoded. */
    readonly components: Readonly<Record<string, Buffer>>;
    /** Finds the item name associated with a number read from the wire. */
    nameOf(runtimeId: number): string | undefined;
}

/** A block definition that can be placed in `StartGamePacket.Block Properties`. */
export interface ProtocolBlockDefinition {
    /** The namespaced block identifier. */
    readonly name: string;
    /** The complete network-NBT definition, including its root tag. */
    readonly definition: Buffer;
}

/**
 * Runtime data supplied by a game server to protocol serializers.
 *
 * The protocol package owns how these values are encoded. A server owns where they come from
 * and supplies captures or generated registries here, so protocol code does not import the
 * server, its content packages, or `bedrock-data`.
 */
export interface ProtocolContext {
    /** The protocol version negotiated for this connection. */
    readonly protocolVersion: number;
    /** Versioned item ids and captured item component compounds. */
    readonly itemData?: ProtocolItemData;
    /** Vanilla and server-defined blocks to declare during `StartGame`. */
    readonly blockDefinitions?: readonly ProtocolBlockDefinition[];
    /** Network-NBT actor catalog sent in `AvailableActorIdentifiersPacket`. */
    readonly entityIdentifiers?: Buffer;
    /** Complete payload for `BiomeDefinitionListPacket`. */
    readonly biomeDefinitions?: Buffer;
    /** Complete payload for `JigsawStructureDataPacket`. */
    readonly jigsawStructureData?: Buffer;
}
