import { showCreditsPacket } from '../wire/definitions/showCredits';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/** The docs' `CreditsState`: whether the credits are starting or have finished. */
export enum CreditsState {
    /** Server to client: roll the credits. */
    Start = 0,
    /** Client to server: the player watched them to the end or skipped them. */
    Finished = 1
}

/**
 * Rolls the end credits, and tells the server when they are over.
 *
 * Sent by the server with `Credits State` set to `Start`, usually when a player leaves the End
 * through the exit portal. The client answers with the same packet and `End` once the credits
 * finish, which is the server's cue to put the player back in the world.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `showCreditsPacket` definition:
 * `Player Runtime ID` as a varuint64, then `Credits State` as a ZigZag varint32.
 *
 * **Bound To:** Client and Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/show-credits-packet/
 */
export default class ShowCreditsPacket extends FieldNetworkPacket {
    /** The runtime id of the player watching. */
    public playerRuntimeId = 0n;

    public creditsState: CreditsState = CreditsState.Start;

    /** Reads the player runtime id and the credits state. */
    public decodePayload(): void {
        const { playerRuntimeId, creditsState } = layoutAt(showCreditsPacket, this.codecProtocol).decode(this);

        this.playerRuntimeId = playerRuntimeId;
        this.creditsState = creditsState;
    }

    /** Writes the player runtime id and the credits state. */
    public encodePayload(): void {
        layoutAt(showCreditsPacket, this.codecProtocol).encode(this, {
            playerRuntimeId: this.playerRuntimeId,
            creditsState: this.creditsState
        });
    }
}
