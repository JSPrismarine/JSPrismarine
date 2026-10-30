import { Difficulty } from '@jsprismarine/minecraft';
import { layoutAt, setDifficultyPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * A difficulty change, sent by a client from the settings menu and by the server when the
 * world's difficulty changes.
 *
 * Protocol 2193 layout (docs id 60): one field, `Difficulty`, a varuint32 holding a
 * `Difficulty` value (Peaceful 0, Easy 1, Normal 2, Hard 3).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-difficulty-packet/
 */
export default class SetDifficultyPacket extends FieldNetworkPacket {
    /** `Difficulty`, written as a varuint32. */
    public difficulty = Difficulty.NORMAL;

    /** Reads the difficulty. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(setDifficultyPacket, this.codecProtocol).decode(this));
    }

    /** Writes the difficulty. */
    public encodePayload(): void {
        layoutAt(setDifficultyPacket, this.codecProtocol).encode(this, this);
    }
}
