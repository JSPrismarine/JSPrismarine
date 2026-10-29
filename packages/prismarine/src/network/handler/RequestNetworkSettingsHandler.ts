import { DisconnectReason, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import type Server from '../../Server';
import type RequestNetworkSettingsPacket from '../packet/RequestNetworkSettingsPacket';
import type PreLoginPacketHandler from './PreLoginPacketHandler';
import type ClientConnection from '../ClientConnection';
import NetworkSettingsPacket, { CompressionThreshold } from '../packet/NetworkSettingsPacket';
import PlayStatusPacket from '../packet/PlayStatusPacket';
import PlayStatus from '../type/PlayStatus';

export default class RequestNetworkSettingsHandler implements PreLoginPacketHandler<RequestNetworkSettingsPacket> {
    public static PacketName = 'RequestNetworkSettingsPacket';
    public readonly preLogin = true;

    public async handle(
        packet: RequestNetworkSettingsPacket,
        server: Server,
        connection: ClientConnection
    ): Promise<void> {
        if (packet.protocolVersion !== Identifiers.Protocol) {
            await RequestNetworkSettingsHandler.refuseProtocol(packet.protocolVersion, server, connection);
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

    /**
     * Tells a client on the wrong protocol which side is behind, then hangs up.
     *
     * This is the first packet a client sends, so a mismatch is caught here and never reaches
     * `LoginHandler`. A bare disconnect at this point shows "Disconnected from Server" and
     * nothing else (#1586). The client renders a failed `PlayStatus` as "Outdated client" or
     * "Outdated server", so it goes first, and the disconnect that follows carries the message
     * and the matching `OutdatedClient` or `OutdatedServer` code.
     *
     * The status is sent uncompressed: compression is only agreed by the `NetworkSettings`
     * this client is not going to get.
     */
    private static async refuseProtocol(protocol: number, server: Server, connection: ClientConnection): Promise<void> {
        const outdatedClient = protocol < Identifiers.Protocol;

        server
            .getLogger()
            .info(
                `Refused a client on protocol ${protocol}: this server speaks ${Identifiers.Protocol}`,
                'RequestNetworkSettingsHandler/handle'
            );

        const playStatus = new PlayStatusPacket();
        playStatus.status = outdatedClient ? PlayStatus.LoginFailed_ClientOld : PlayStatus.LoginFailed_ServerOld;
        await connection.sendDataPacket(playStatus, false);

        await connection.disconnect(
            outdatedClient ? `Outdated client! Please use ${Identifiers.MinecraftVersions.at(-1)}` : 'Outdated server!',
            false,
            outdatedClient ? DisconnectReason.OUTDATED_CLIENT : DisconnectReason.OUTDATED_SERVER
        );
    }
}
