import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The `PlayStatus` enum carried by `PlayStatusPacket`, numbered as the protocol 2193 docs list
 * them. Member names follow gophertunnel; the comment on each gives the docs name, so compare
 * by value when the two disagree.
 */
export enum PlayStatus {
    /** Docs: `LoginSuccess`. */
    LoginSuccess,
    /** Docs: `LoginFailed_ClientOld`. */
    LoginFailedClient,
    /** Docs: `LoginFailed_ServerOld`. */
    LoginFailedServer,
    /** Docs: `PlayerSpawn`. */
    PlayerSpawn,
    /** Docs: `LoginFailed_InvalidTenant`. */
    LoginFailedInvalidTenant,
    /** Docs: `LoginFailed_EditionMismatchEduToVanilla`. */
    LoginFailedVanillaEdu,
    /** Docs: `LoginFailed_EditionMismatchVanillaToEdu`. */
    LoginFailedEduVanilla,
    /** Docs: `LoginFailed_ServerFullSubClient`. */
    LoginFailedServerFull,
    /** Docs: `LoginFailed_EditorMismatchEditorToVanilla`. */
    LoginFailedEditorVanilla,
    /** Docs: `LoginFailed_EditorMismatchVanillaToEditor`. */
    LoginFailedVanillaEditor
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
