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
    private overridesByName: Readonly<Record<string, PacketClass>> | null = null;

    /**
     * The packet classes this codec substitutes for the barrel's, by class name. A delta
     * codec lists here only the packets whose wire layout changed in its version; every
     * other name keeps the inherited class.
     * @returns {Readonly<Record<string, PacketClass>>} the substituted classes, empty at 2193.
     */
    protected packetOverrides(): Readonly<Record<string, PacketClass>> {
        return {};
    }

    private overrides(): Readonly<Record<string, PacketClass>> {
        return (this.overridesByName ??= this.packetOverrides());
    }

    private table(): Map<number, PacketClass> {
        if (this.byId === null) {
            this.byId = new Map();
            const overrides = this.overrides();
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

    /**
     * The outbound instance for this codec's wire; see {@link ProtocolCodec.prepareOutbound}.
     *
     * A substituted class extends the base class it replaces, so a copy built from the base
     * instance's own properties starts from the subclass's defaults for the fields its
     * version added and carries every field the caller set. The copy encodes from scratch,
     * so the copied stream state is cleared before it matters.
     */
    public prepareOutbound(packet: DataPacket): DataPacket {
        const override = this.overrides()[packet.getName()];
        if (override === undefined || packet instanceof override) return packet;

        const prepared = Object.assign(new override(), packet);
        prepared.codecProtocol = this.protocolVersion;
        return prepared;
    }

    /** The wire id under a packet class name; see {@link ProtocolCodec.netIdOf}. */
    public netIdOf(name: string): number | undefined {
        return netIdFor(name);
    }
}

export default new Codec2193();
