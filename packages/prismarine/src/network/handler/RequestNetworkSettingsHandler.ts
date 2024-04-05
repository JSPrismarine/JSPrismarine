import Identifiers from '../Identifiers';
import type Server from '../../Server';
import type PreLoginPacketHandler from './PreLoginPacketHandler';
import type ClientConnection from '../ClientConnection';
import NetworkSettingsPacket, {
    PacketCompressionAlgorithm,
    CompressionThreshold
} from '../packet/NetworkSettingsPacket';
import { RequestNetworkSettingsPacket } from '@jsprismarine/protocol';

export default class RequestNetworkSettingsHandler implements PreLoginPacketHandler<RequestNetworkSettingsPacket> {
    public static NetID = Identifiers.RequestNetworkSettingsPacket;

    public async handle(
        packet: RequestNetworkSettingsPacket,
        _server: Server,
        connection: ClientConnection
    ): Promise<void> {
        const data = packet.getPacketData()!;

        if (data.clientNetworkVersion !== Identifiers.Protocol) {
            connection.disconnect(`Unsupported protocol version: ${data.clientNetworkVersion}`);
            return;
        }

        console.log('Received RequestNetworkSettingsPacket' + data.clientNetworkVersion);

        const networkSettings = new NetworkSettingsPacket();
        networkSettings.compressionThreshold = CompressionThreshold.COMPRESS_EVERYTHING;
        networkSettings.compressionAlgorithm = PacketCompressionAlgorithm.ZLIB;
        networkSettings.clientThrottlingEnabled = false;
        networkSettings.clientThrottleThreshold = 0;
        networkSettings.clientThrottleScalar = 0;

        connection.hasCompression = true;

        // Send as uncompressed, this will initialize compression
        await connection.sendDataPacket(networkSettings, false);
    }
}
