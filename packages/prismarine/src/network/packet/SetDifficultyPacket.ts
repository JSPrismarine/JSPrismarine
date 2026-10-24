import { Difficulty } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * A difficulty change, sent by a client from the settings menu and by the server when the
 * world's difficulty changes.
 *
 * Wire layout at protocol 2193: Difficulty as a varuint32, see `Difficulty`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/set-difficulty-packet/
 */
export default class SetDifficultyPacket extends DataPacket {
    public static NetID = Identifiers.SetDifficultyPacket;

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
