import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Whether the credits are starting or have finished.
 *
 * The docs give `Credits State` as a bare varint32 without naming its members. These are the
 * two values gophertunnel sends and the vanilla client answers with.
 */
export enum CreditsState {
    /** Server to client: roll the credits. */
    Start = 0,
    /** Client to server: the player watched them to the end or skipped them. */
    End = 1
}

/**
 * Rolls the end credits, and tells the server when they are over.
 *
 * Sent by the server with `Credits State` set to `Start`, usually when a player leaves the End
 * through the exit portal. The client answers with the same packet and `End` once the credits
 * finish, which is the server's cue to put the player back in the world.
 *
 * Wire order at protocol 2193: `Player Runtime ID` as a varuint64, then `Credits State` as a
 * ZigZag varint32.
 *
 * **Bound To:** Client and Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/show-credits-packet/
 */
export default class ShowCreditsPacket extends DataPacket {
    public static NetID = Identifiers.ShowCreditsPacket;

    /** The runtime id of the player watching. */
    public playerRuntimeId = 0n;

    public creditsState: CreditsState = CreditsState.Start;

    /** Reads the player runtime id and the credits state. */
    public decodePayload(): void {
        this.playerRuntimeId = this.readUnsignedVarLong();
        this.creditsState = this.readVarInt();
    }

    /** Writes the player runtime id and the credits state. */
    public encodePayload(): void {
        this.writeUnsignedVarLong(this.playerRuntimeId);
        this.writeVarInt(this.creditsState);
    }
}
