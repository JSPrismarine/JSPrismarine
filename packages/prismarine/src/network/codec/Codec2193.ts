import * as Packets from '../Packets';
import type DataPacket from '../packet/DataPacket';
import type { ProtocolCodec } from './ProtocolCodec';
import { minecraftVersions, netIdFor, packetIds, protocolVersion } from './v2193';

/** Exported packet classes no codec lists: the base class and the batch envelope. */
type PacketClass = (typeof Packets)[keyof typeof Packets];

/**
 * The codec for protocol 2193, built from the packet barrel and the 2193 id table. The first
 * concrete {@link ProtocolCodec}; a later version extends it with only the packets that
 * changed.
 *
 * The id-to-class map is built on first use rather than at module load, because this module
 * and the packet barrel import each other: the barrel's classes must finish evaluating before
 * the barrel's exports can be walked.
 */
class Codec2193 implements ProtocolCodec {
    public readonly protocolVersion = protocolVersion;
    public readonly minecraftVersions = minecraftVersions;
    public readonly ids = packetIds;

    private byId: Map<number, PacketClass> | null = null;

    private table(): Map<number, PacketClass> {
        if (this.byId === null) {
            this.byId = new Map();
            for (const [name, packet] of Object.entries(Packets)) {
                const id = this.netIdOf(name);
                if (id !== undefined) this.byId.set(id, packet);
            }
        }

        return this.byId;
    }

    public createPacket(netId: number, buffer?: Buffer): DataPacket | null {
        const packetClass = this.table().get(netId);
        if (packetClass === undefined) return null;

        const packet = new packetClass(buffer);
        packet.setNetId(netId);
        packet.codecProtocol = this.protocolVersion;
        return packet;
    }

    public netIdOf(name: string): number | undefined {
        return netIdFor(name);
    }
}

export default new Codec2193();
