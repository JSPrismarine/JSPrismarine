import type DataPacket from '../packet/DataPacket';

/**
 * One protocol version's view of the wire: which Minecraft versions speak it, which wire id
 * each packet class name has, and how to build a packet instance from an inbound id.
 *
 * Every session resolves packets through a codec rather than through a global table, so a
 * second protocol version can ship as a delta over an existing codec instead of a second
 * copy of the packet machinery.
 */
export interface ProtocolCodec {
    /** The protocol version this codec speaks, as `RequestNetworkSettings` carries it. */
    readonly protocolVersion: number;
    /** The Minecraft versions that speak {@link protocolVersion}, in ascending order. */
    readonly minecraftVersions: readonly string[];
    /** Wire id by packet class name. */
    readonly ids: Readonly<Record<string, number>>;

    /**
     * A packet instance for an inbound wire id, stamped with this codec's id and version.
     * @param {number} netId - the id read from the packet header.
     * @param {Buffer} [buffer] - the encoded packet, when decoding inbound bytes.
     * @returns {DataPacket | null} the packet, or `null` for an id this codec does not know.
     */
    createPacket(netId: number, buffer?: Buffer): DataPacket | null;

    /**
     * The wire id under a packet class name.
     * @param {string} name - the packet class name, for example `'LoginPacket'`.
     * @returns {number | undefined} the id, or `undefined` for a name this codec does not list.
     */
    netIdOf(name: string): number | undefined;
}
