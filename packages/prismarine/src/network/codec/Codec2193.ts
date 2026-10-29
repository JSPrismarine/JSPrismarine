import * as Packets from '../Packets';
import type DataPacket from '../packet/DataPacket';
import type { ProtocolCodec } from './ProtocolCodec';
import { minecraftVersions, netIdFor, packetIds, protocolVersion } from './v2193';

/** Exported packet classes no codec lists: the base class and the batch envelope. */
export type PacketClass = (typeof Packets)[keyof typeof Packets];

/**
 * The codec for protocol 2193, built from the packet barrel and the 2193 id table. The first
 * concrete {@link ProtocolCodec}; a later version extends it with only the packets that
 * changed: new ids through {@link netIdOf}, changed layouts through {@link packetOverrides}.
 *
 * The id-to-class map is built on first use rather than at module load, because this module
 * and the packet barrel import each other: the barrel's classes must finish evaluating before
 * the barrel's exports can be walked.
 */
export class Codec2193 implements ProtocolCodec {
    public readonly protocolVersion: number = protocolVersion;
    public readonly minecraftVersions: readonly string[] = minecraftVersions;
    public readonly ids: Readonly<Record<string, number>> = packetIds;

    private byId: Map<number, PacketClass> | null = null;

    /**
     * The packet classes this codec substitutes for the barrel's, by class name. A delta
     * codec lists here only the packets whose wire layout changed in its version; every
     * other name keeps the inherited class.
     * @returns {Readonly<Record<string, PacketClass>>} the substituted classes, empty at 2193.
     */
    protected packetOverrides(): Readonly<Record<string, PacketClass>> {
        return {};
    }

    private table(): Map<number, PacketClass> {
        if (this.byId === null) {
            this.byId = new Map();
            const overrides = this.packetOverrides();
            for (const [name, packet] of Object.entries(Packets)) {
                const id = this.netIdOf(name);
                if (id !== undefined) this.byId.set(id, overrides[name] ?? packet);
            }
        }

        return this.byId;
    }

    /** A packet instance for an inbound wire id; see {@link ProtocolCodec.createPacket}. */
    public createPacket(netId: number, buffer?: Buffer): DataPacket | null {
        const packetClass = this.table().get(netId);
        if (packetClass === undefined) return null;

        const packet = new packetClass(buffer);
        packet.setNetId(netId);
        packet.codecProtocol = this.protocolVersion;
        return packet;
    }

    /** The wire id under a packet class name; see {@link ProtocolCodec.netIdOf}. */
    public netIdOf(name: string): number | undefined {
        return netIdFor(name);
    }
}

export default new Codec2193();
