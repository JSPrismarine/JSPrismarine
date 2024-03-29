import { NetworkPacket, PacketIdentifier, NetworkBinaryStream } from '../';

export enum PlayStatus {
    LOGIN_SUCCESS,
    LOGIN_FAILED_CLIENT_OLD,
    LOGIN_FAILED_SERVER_OLD,
    PLAYER_SPAWN,
    LOGIN_FAILED_INVALID_TENANT,
    LOGIN_FAILED_EDITION_EDU_VANILLA,
    LOGIN_FAILED_EDITION_VANILLA_EDU,
    LOGIN_FAILED_SERVER_FULL_SUB_CLIENT,
    LOGIN_FAILED_EDITION_EDITOR_VANILLA,
    LOGIN_FAILED_EDITION_VANILLA_EDITOR
}

interface PacketData {
    status: PlayStatus;
}

/**
 * Used after the Server handles a Login or (Sub)Client Authentication Packet.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/PlayStatusPacket.html}
 */
export default class PlayStatusPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.PLAY_STATUS;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeInt(packetData.status);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            status: stream.readInt()
        };
    }
}
