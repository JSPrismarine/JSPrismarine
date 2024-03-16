import Identifiers from '../Identifiers';
import type Server from '../../Server';
import RequestNetworkSettingsPacket from '../packet/RequestNetworkSettingsPacket';
import PreLoginPacketHandler from './PreLoginPacketHandler';
import ClientConnection from '../ClientConnection';
import NetworkSettingsPacket, { PacketCompressionAlgorithm, CompressionThreshold } from '../packet/NetworkSettingsPacket';

export default class RequestNetworkSettingsHandler implements PreLoginPacketHandler<RequestNetworkSettingsPacket> {
    public static NetID = Identifiers.RequestNetworkSettingsPacket;

    public async handle(
        packet: RequestNetworkSettingsPacket,
        _server: Server,
        connection: ClientConnection
    ): Promise<void> {
        if (packet.protocolVersion !== Identifiers.Protocol) {
            connection.disconnect(`Unsupported protocol version: ${packet.protocolVersion}`);
            return;
        }

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
