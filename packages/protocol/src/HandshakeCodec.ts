import type { ProtocolCodec } from './ProtocolCodec';
import type NetworkPacket from './NetworkPacket';

/** Packet class names allowed before a client announces its protocol version. */
export const HANDSHAKE_PACKET_NAMES = [
    'RequestNetworkSettingsPacket',
    'NetworkSettingsPacket',
    'PlayStatusPacket',
    'DisconnectPacket'
] as const;

/**
 * Creates the codec used before protocol negotiation completes.
 * @param latestCodec - A configured codec; the four handshake packets use its stable ids.
 * @returns A codec that rejects every id outside the handshake exchange.
 */
export const createHandshakeCodec = (latestCodec: ProtocolCodec): ProtocolCodec => {
    const ids: Record<string, number> = {};
    for (const name of HANDSHAKE_PACKET_NAMES) {
        const id = latestCodec.netIdOf(name);
        if (id === undefined) throw new Error(`Handshake packet ${name} has no id in the latest codec!`);
        ids[name] = id;
    }

    const netIds = new Set(Object.values(ids));
    return {
        protocolVersion: latestCodec.protocolVersion,
        minecraftVersions: latestCodec.minecraftVersions,
        ids,
        itemData: latestCodec.itemData,
        context: latestCodec.context,
        createPacket(netId: number, buffer?: Buffer): NetworkPacket<unknown> | null {
            return netIds.has(netId) ? latestCodec.createPacket(netId, buffer) : null;
        },
        prepareOutbound(packet) {
            return packet;
        },
        netIdOf(name) {
            return ids[name];
        }
    };
};
