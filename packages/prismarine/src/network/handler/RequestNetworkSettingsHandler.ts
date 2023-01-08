import Identifiers from '../Identifiers.js';
import type Server from '../../Server.js';
import RequestNetworkSettingsPacket from '../packet/RequestNetworkSettingsPacket.js';
import PreLoginPacketHandler from './PreLoginPacketHandler.js';
import ClientConnection from '../ClientConnection.js';
import NetworkSettingsPacket, { CompressionAlgorithm, CompressionThreshold } from '../packet/NetworkSettingsPacket.js';

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
        networkSettings.compressionAlgorithm = CompressionAlgorithm.ZLIB;
        networkSettings.enableClientThrottling = false;
        networkSettings.clientThrottleThreshold = 0;
        networkSettings.clientThrottleScalar = 0;

        connection.hasCompression = true;

        // Send as uncompressed, this will initialize compression
        await connection.sendDataPacket(networkSettings, false);
    }
}
