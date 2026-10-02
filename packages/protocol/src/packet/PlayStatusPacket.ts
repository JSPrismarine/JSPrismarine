import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** @see https://mojang.github.io/bedrock-protocol-docs/html/PlayStatusPacket.html */
export enum PlayStatus {
    LoginSuccess,
    LoginFailedClient,
    LoginFailedServer,
    PlayerSpawn,
    LoginFailedInvalidTenant,
    LoginFailedVanillaEdu,
    LoginFailedEduVanilla,
    LoginFailedServerFull
}

export interface PlayStatusData {
    status: PlayStatus;
}

/**
 * The server's verdict on a login, and later the signal that the world is ready.
 *
 * `PlayerSpawn` arriving is what tells the client it may answer with
 * `SetLocalPlayerAsInitialized`, so this packet appears twice in one join for two unrelated
 * reasons.
 */
export default class PlayStatusPacket extends NetworkPacket<PlayStatusData> {
    public get id(): number {
        return PacketIdentifier.PLAY_STATUS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayStatusData): void {
        stream.writeInt(data.status);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayStatusData {
        return { status: stream.readInt() };
    }
}
