import { Difficulty } from '@jsprismarine/minecraft';
import DataPacket from './DataPacket';

/**
 * A difficulty change, sent by a client from the settings menu and by the server when the
 * world's difficulty changes.
 *
 * Protocol 2193 layout (docs id 60): one field, `Difficulty`, a varuint32 holding a
 * `Difficulty` value (Peaceful 0, Easy 1, Normal 2, Hard 3).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-difficulty-packet/
 */
export default class SetDifficultyPacket extends DataPacket {
    /** `Difficulty`, written as a varuint32. */
    public difficulty = Difficulty.NORMAL;

    /** Reads the difficulty. */
    public decodePayload(): void {
        this.difficulty = this.readUnsignedVarInt();
    }

    /** Writes the difficulty. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.difficulty);
    }
}
