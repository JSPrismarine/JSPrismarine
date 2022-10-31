import Identifiers from '../Identifiers';
import type Server from '../../Server';
import RequestNetworkSettingsPacket from '../packet/RequestNetworkSettingsPacket';
import PreLoginPacketHandler from './PreLoginPacketHandler';
import ClientConnection from '../ClientConnection';
import NetworkSettingsPacket, { CompressionAlgorithm, CompressionThreshold } from '../packet/NetworkSettingsPacket';

export default class RequestNetworkSettingsHandler implements PreLoginPacketHandler<RequestNetworkSettingsPacket> {
    public static NetID = Identifiers.RequestNetworkSettingsPacket;

    public async handle(packet: RequestNetworkSettingsPacket, _server: Server, connection: ClientConnection): Promise<void> {
        if (packet.protocolVersion !== Identifiers.Protocol) {
            connection.disconnect(`Unsupported protocol version: ${packet.protocolVersion}`);
            return;
        }

        const networkSettings = new NetworkSettingsPacket();
        networkSettings.compressionThreshold = CompressionThreshold.COMPRESS_EVERYTHING;
        networkSettings.compressionAlgorithm = CompressionAlgorithm.ZLIB;
        networkSettings.enableClientThrottling = false;
        networkSettings.clientThrottleScalar = 0;
        networkSettings.clientThrottleThreshold = 0;
        await connection.sendDataPacket(networkSettings);
    }
}