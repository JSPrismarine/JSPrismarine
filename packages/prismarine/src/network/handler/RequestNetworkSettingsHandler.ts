import { DisconnectReason, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { codecForProtocol, latestCodec } from '../codec/CodecRegistry';
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
        // The one negotiation point: the client's first packet names its protocol version,
        // and either the registry has a codec for it or the connection ends here.
        const codec = codecForProtocol(packet.protocolVersion);
        if (codec === undefined) {
            await RequestNetworkSettingsHandler.refuseProtocol(packet.protocolVersion, server, connection);
            return;
        }

        connection.codec = codec;

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
        const outdatedClient = protocol < latestCodec.protocolVersion;

        server
            .getLogger()
            .info(
                `Refused a client on protocol ${protocol}: this server speaks ${latestCodec.protocolVersion}`,
                'RequestNetworkSettingsHandler/handle'
            );

        const playStatus = new PlayStatusPacket();
        playStatus.status = outdatedClient ? PlayStatus.LoginFailed_ClientOld : PlayStatus.LoginFailed_ServerOld;
        await connection.sendDataPacket(playStatus, false);

        await connection.disconnect(
            outdatedClient ? `Outdated client! Please use ${latestCodec.minecraftVersions.at(-1)}` : 'Outdated server!',
            false,
            outdatedClient ? DisconnectReason.OUTDATED_CLIENT : DisconnectReason.OUTDATED_SERVER
        );
    }
}
