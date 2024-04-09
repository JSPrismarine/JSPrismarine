import Identifiers from '../Identifiers';
import type Server from '../../Server';
import type PreLoginPacketHandler from './PreLoginPacketHandler';
import type ClientConnection from '../ClientConnection';
import type { PacketData } from '@jsprismarine/protocol';
import { NetworkSettingsPacket } from '@jsprismarine/protocol';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';

export default class RequestNetworkSettingsHandler implements PreLoginPacketHandler<PacketData.RequestNetworkSettings> {
    public static NetID = Identifiers.RequestNetworkSettingsPacket;

    public async handle(
        data: PacketData.RequestNetworkSettings,
        _server: Server,
        connection: ClientConnection
    ): Promise<void> {
        if (data.clientNetworkVersion !== Identifiers.Protocol) {
            connection.disconnect(`Unsupported protocol version: ${data.clientNetworkVersion}`);
            return;
        }

        // console.log('Received RequestNetworkSettingsPacket' + data.clientNetworkVersion);

        // Send as uncompressed, this will initialize compression
        connection.sendNetworkPacket(
            new NetworkSettingsPacket({
                compressionThreshold: 1,
                compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
                clientThrottleEnabled: false,
                clientThrottleThreshold: 0,
                clientThrottleScalar: 0
            })
        );

        connection.enableCompression();
    }
}
