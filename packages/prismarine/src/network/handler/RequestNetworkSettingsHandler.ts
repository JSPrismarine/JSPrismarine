import { DisconnectReason, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import {
    CompressionThreshold,
    NetworkSettingsPacket,
    PlayStatus,
    PlayStatusPacket,
    SctpRecoveryProfile
} from '@jsprismarine/protocol';
import type { RequestNetworkSettingsPacket } from '@jsprismarine/protocol';
import { advertisedCodec } from '../codec/CodecRegistry';
import type ClientConnection from '../ClientConnection';
import type { ConnectionContext, ConnectionHandler } from './ConnectionContext';
import type { HandlerLog } from './HandlerContext';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

export default class RequestNetworkSettingsHandler implements ConnectionHandler<RequestNetworkSettingsPacket> {
    public static PacketName = 'RequestNetworkSettingsPacket';
    public readonly phases = ['handshake'] as const;
    public readonly lane = 'connection';

    public async handle(
        packet: RequestNetworkSettingsPacket,
        { connection, log, config, protocols }: ConnectionContext
    ): Promise<void> {
        const request = packet.getPacketData();
        if (request === null) throw new PrismarineNetworkErrors.NetworkSettingsRequestNotDecoded();

        // The one negotiation point: the client's first packet names its protocol version,
        // and either the protocol window accepts it or the connection ends here.
        const codec = protocols.codecFor(request.protocolVersion);
        if (codec === undefined) {
            await RequestNetworkSettingsHandler.refuseProtocol(request.protocolVersion, protocols, log, connection);
            return;
        }

        connection.codec = codec;
        connection.phase = 'login';

        const compressionAlgorithm = config.getPacketCompressionAlgorithm();
        const compressionThreshold =
            compressionAlgorithm === PacketCompressionAlgorithm.NONE
                ? CompressionThreshold.COMPRESS_NOTHING
                : config.getPacketCompressionThreshold();
        const networkSettings = new NetworkSettingsPacket({
            compressionThreshold,
            compressionAlgorithm,
            clientThrottlingEnabled: false,
            clientThrottleThreshold: 0,
            clientThrottleScalar: 0,
            sctpRecoveryProfile: SctpRecoveryProfile.Default
        });

        connection.setCompressionSettings(compressionAlgorithm, compressionThreshold);
        connection.hasCompression = true;

        // Send as uncompressed, this will initialize compression
        await connection.sendDataPacket(networkSettings, false);
    }

    /**
     * Tells a client on the wrong protocol which side is behind, then hangs up.
     *
     * This is the first packet a client sends, so a mismatch is caught here and never reaches
     * `LoginHandler`. A client older than the newest accepted release is outdated, including one
     * this build has a codec for that the protocol window leaves out. A bare disconnect at this point shows "Disconnected from Server" and
     * nothing else (#1586). The client renders a failed `PlayStatus` as "Outdated client" or
     * "Outdated server", so it goes first, and the disconnect that follows carries the message
     * and the matching `OutdatedClient` or `OutdatedServer` code.
     *
     * The status is sent uncompressed: compression is only agreed by the `NetworkSettings`
     * this client is not going to get.
     */
    private static async refuseProtocol(
        protocol: number,
        protocols: ConnectionContext['protocols'],
        log: HandlerLog,
        connection: ClientConnection
    ): Promise<void> {
        const outdatedClient = protocol < protocols.accepted[0]!.protocolVersion;

        log.info(
            `Refused a client on protocol ${protocol}: this server accepts ${protocols.accepted.map((codec) => codec.protocolVersion).join(', ')}`,
            'RequestNetworkSettingsHandler/handle'
        );

        const status = outdatedClient ? PlayStatus.LoginFailed_ClientOld : PlayStatus.LoginFailed_ServerOld;
        await connection.sendDataPacket(new PlayStatusPacket({ status }), false);

        await connection.disconnect(
            outdatedClient
                ? `Outdated client! Please use ${advertisedCodec.minecraftVersions.at(-1)}`
                : 'Outdated server!',
            false,
            outdatedClient ? DisconnectReason.OUTDATED_CLIENT : DisconnectReason.OUTDATED_SERVER
        );
    }
}
