import NetworkPacket from './NetworkPacket';
import * as Packets from './packet';

import type { ProtocolContext, ProtocolItemData } from './ProtocolContext';
import type { ProtocolVersionDefinition } from './ProtocolVersion';

/** A constructible packet class exported by the protocol package. */
export type ProtocolPacketClass = new (...args: never[]) => NetworkPacket<unknown>;

/** One protocol version's view of the wire and its server-supplied data. */
export interface ProtocolCodec {
    /** The protocol version this codec speaks, as `RequestNetworkSettingsPacket` carries it. */
    readonly protocolVersion: number;
    /** Minecraft releases that speak this wire version, in ascending order. */
    readonly minecraftVersions: readonly string[];
    /** Wire id by packet class name. */
    readonly ids: Readonly<Record<string, number>>;
    /** Item names and runtime ids supplied by the server for this wire version. */
    readonly itemData: ProtocolItemData;
    /** Versioned tables and captures supplied by the server to packet serializers. */
    readonly context: ProtocolContext;

    /**
     * Builds a packet instance for an inbound wire id.
     * @param netId - The id read from the packet header.
     * @param buffer - The encoded packet, when decoding inbound bytes.
     * @returns The packet, or `null` for an id with no packet implementation.
     */
    createPacket(netId: number, buffer?: Buffer): NetworkPacket<unknown> | null;

    /**
     * Stamps an outbound packet with the protocol version whose layout it must use.
     * @param packet - The packet as the caller built it.
     * @returns The same packet, now associated with this codec's wire version.
     */
    prepareOutbound(packet: NetworkPacket<unknown>): NetworkPacket<unknown>;

    /**
     * Finds the wire id assigned to a packet class name.
     * @param name - A packet class name such as `'LoginPacket'`.
     * @returns The id, or `undefined` when this version has no such packet.
     */
    netIdOf(name: string): number | undefined;
}

/** Options needed to create a codec without giving Protocol ownership of the server's content data. */
export interface ProtocolCodecOptions {
    /** The version's packet ids and Minecraft release names. */
    readonly definition: ProtocolVersionDefinition;
    /** Captured item, block, and other tables supplied by the server. */
    readonly context: ProtocolContext;
}

const isProtocolPacketClass = (value: unknown): value is ProtocolPacketClass =>
    typeof value === 'function' && value.prototype instanceof NetworkPacket;

/**
 * Creates a version codec from Protocol's packet classes and a server-provided data context.
 * Protocol owns packet construction, ids, and version stamping; the server supplies captured
 * registries through `context` so this package does not depend on a particular game's content.
 * @param options - The packet-id definition and data for the selected protocol version.
 * @returns A codec that reads and writes packets using that version's ids and tables.
 */
export const createProtocolCodec = ({ definition, context }: ProtocolCodecOptions): ProtocolCodec => {
    if (context.protocolVersion !== definition.protocolVersion) {
        throw new Error(
            `Protocol context ${context.protocolVersion} does not match codec ${definition.protocolVersion}!`
        );
    }

    const itemData = context.itemData;
    if (itemData === undefined) {
        throw new Error(`Protocol ${definition.protocolVersion} requires versioned item data!`);
    }
    if (itemData.protocolVersion !== definition.protocolVersion) {
        throw new Error(`Item data ${itemData.protocolVersion} does not match codec ${definition.protocolVersion}!`);
    }

    const packetsById = new Map<number, ProtocolPacketClass>();
    for (const [name, value] of Object.entries(Packets)) {
        const id = definition.ids[name];
        if (id === undefined || !isProtocolPacketClass(value)) continue;

        const registered = packetsById.get(id);
        if (registered !== undefined && registered !== value) {
            throw new Error(`Protocol ${definition.protocolVersion} assigns packet id ${id} to multiple classes!`);
        }
        packetsById.set(id, value);
    }

    return {
        protocolVersion: definition.protocolVersion,
        minecraftVersions: definition.minecraftVersions,
        ids: definition.ids,
        itemData,
        context,
        createPacket(netId, buffer) {
            const Packet = packetsById.get(netId);
            if (Packet === undefined) return null;

            const packet = new Packet();
            if (buffer !== undefined) packet.setReadBuffer(buffer);
            packet.setNetId(netId);
            packet.codecProtocol = definition.protocolVersion;
            return packet;
        },
        prepareOutbound(packet) {
            packet.codecProtocol = definition.protocolVersion;
            return packet;
        },
        netIdOf(name) {
            return definition.ids[name];
        }
    };
};
