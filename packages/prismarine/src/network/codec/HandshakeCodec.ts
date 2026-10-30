import type DataPacket from '../packet/DataPacket';
import { latestCodec } from './CodecRegistry';
import type { ProtocolCodec } from './ProtocolCodec';

/**
 * The packets a connection may exchange before a protocol version has been negotiated: the
 * client's `RequestNetworkSettings` and the three answers the server can give it. Their wire
 * ids and layouts are stable across protocol versions - they have to be, or no client could
 * ever announce a version.
 */
const HANDSHAKE_PACKETS = [
    'RequestNetworkSettingsPacket',
    'NetworkSettingsPacket',
    'PlayStatusPacket',
    'DisconnectPacket'
] as const;

const handshakeIds: Readonly<Record<string, number>> = Object.fromEntries(
    HANDSHAKE_PACKETS.map((name) => {
        const netId = latestCodec.netIdOf(name);
        if (netId === undefined) throw new Error(`Handshake packet ${name} has no id in the latest codec!`);
        return [name, netId] as const;
    })
);

const handshakeNetIds: ReadonlySet<number> = new Set(Object.values(handshakeIds));

/**
 * The layout-stable codec every connection starts on, before the client has announced a
 * protocol version. It speaks only the {@link HANDSHAKE_PACKETS}; anything else decodes to
 * `null`, which the dispatcher drops with a warning. `RequestNetworkSettingsHandler` swaps
 * it for the negotiated codec.
 *
 * Built over the newest codec, whose ids and layouts for these four packets are the stable
 * ones by definition. The advertised protocol version is likewise the newest: it is what a
 * refusal names, and what a payload would be version-gated against before negotiation.
 */
class HandshakeCodec implements ProtocolCodec {
    public readonly protocolVersion = latestCodec.protocolVersion;
    public readonly minecraftVersions = latestCodec.minecraftVersions;
    public readonly ids = handshakeIds;
    /**
     * The newest version's, for the same reason {@link protocolVersion} is. No handshake
     * packet carries an item, so nothing reads this before negotiation.
     */
    public readonly itemData = latestCodec.itemData;
    public readonly context = latestCodec.context;

    public createPacket(netId: number, buffer?: Buffer): DataPacket | null {
        if (!handshakeNetIds.has(netId)) return null;
        return latestCodec.createPacket(netId, buffer);
    }

    public netIdOf(name: string): number | undefined {
        return handshakeIds[name];
    }

    /** Identity: the handshake packets' layouts are stable across versions by definition. */
    public prepareOutbound(packet: DataPacket): DataPacket {
        return packet;
    }
}

export default new HandshakeCodec();
