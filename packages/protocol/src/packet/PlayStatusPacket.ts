import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' `PlayStatus` enum, the `Status` of a `PlayStatusPacket`, with the docs' member
 * names and the values the protocol 2193 docs list.
 */
export enum PlayStatus {
    LoginSuccess,
    LoginFailed_ClientOld,
    LoginFailed_ServerOld,
    PlayerSpawn,
    LoginFailed_InvalidTenant,
    LoginFailed_EditionMismatchEduToVanilla,
    LoginFailed_EditionMismatchVanillaToEdu,
    LoginFailed_ServerFullSubClient,
    LoginFailed_EditorMismatchEditorToVanilla,
    LoginFailed_EditorMismatchVanillaToEditor
}

/** The one field of `PlayStatusPacket`. */
export interface PlayStatusData {
    /** The `Status` field, a `PlayStatus` value. */
    status: PlayStatus;
}

/**
 * The server's verdict on a login, and later the signal that the world is ready.
 *
 * `PlayerSpawn` arriving is what tells the client it may answer with
 * `SetLocalPlayerAsInitialized`, so this packet appears twice in one join for two unrelated
 * reasons.
 *
 * Protocol 2193 layout after the header: `Status`, a big-endian int32 holding a `PlayStatus`
 * enum value. Nothing else.
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
